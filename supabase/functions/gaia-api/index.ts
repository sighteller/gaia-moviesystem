
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const base = Deno.env.get("SUPABASE_URL") + "/rest/v1";
const publishable = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")["default"];

async function api(path, init = {}) {
  const headers = {
    "apikey": publishable,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const r = await fetch(base + "/" + path, { ...init, headers });
  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  try {
    const { action, payload = {} } = await req.json();

    if (action === "catalog") {
      const [titles, platforms, links] = await Promise.all([
        api("titles?select=*&active=eq.true&order=name.asc"),
        api("platforms?select=*&active=eq.true&order=name.asc"),
        api("title_platforms?select=*&active=eq.true"),
      ]);
      return response({ titles, platforms, links });
    }

    if (action === "resume") {
      const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();
      await api("sessions?device_id=eq." + payload.deviceId + "&status=eq.active&last_interaction_at=lt." + encodeURIComponent(cutoff), {
        method: "PATCH",
        body: JSON.stringify({ status: "expired" }),
      });
      const rows = await api("sessions?select=*&device_id=eq." + payload.deviceId + "&status=eq.active&last_interaction_at=gte." + encodeURIComponent(cutoff) + "&order=last_interaction_at.desc&limit=1");
      return response({ session: rows?.[0] || null });
    }

    if (action === "start") {
      const now = new Date();
      const rows = await api("sessions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          device_id: payload.deviceId,
          category: payload.category,
          enabled_platform_ids: payload.enabledPlatformIds || [],
          current_title_id: payload.currentTitleId,
          navigation_history: [],
          status: "active",
          started_at: now.toISOString(),
          last_interaction_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
        }),
      });
      return response({ session: rows[0] });
    }

    if (action === "touch") {
      const now = new Date();
      await api("sessions?id=eq." + payload.sessionId, {
        method: "PATCH",
        body: JSON.stringify({
          current_title_id: payload.currentTitleId,
          navigation_history: payload.history || [],
          last_interaction_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
        }),
      });
      return response({ ok: true });
    }

    if (action === "reject") {
      await api("session_rejections?on_conflict=session_id,title_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ session_id: payload.sessionId, title_id: payload.titleId }),
      });
      return response({ ok: true });
    }

    if (action === "unreject") {
      await api("session_rejections?session_id=eq." + payload.sessionId + "&title_id=eq." + payload.titleId, { method: "DELETE" });
      return response({ ok: true });
    }

    if (action === "checkViewing") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.deviceId || "")) return response({ error: "Invalid device" }, 400);
      return response(await api("rpc/gaia_check_viewing", {
        method: "POST", body: JSON.stringify({ target_device: payload.deviceId }),
      }));
    }

    if (action === "finalize") {
      const now = new Date().toISOString();
      await api("selections", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          session_id: payload.sessionId,
          device_id: payload.deviceId,
          title_id: payload.titleId,
          platform_id: payload.platformId,
          selection_mode: payload.mode,
          selected_at: now,
          expected_end_at: payload.expectedEndAt || null,
          viewing_status: "in_progress",
          status_updated_at: now,
        }),
      });
      await api("sessions?id=eq." + payload.sessionId, {
        method: "PATCH",
        body: JSON.stringify({ status: "completed", completed_at: now, last_interaction_at: now }),
      });
      return response({ ok: true });
    }

    if (action === "discoveryHistory") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.deviceId || "")) return response({ error: "Invalid device" }, 400);
      const selections = await api("selections?select=title_id,selection_mode,viewing_status,selected_at&device_id=eq." + payload.deviceId + "&order=selected_at.desc&limit=500");
      return response({ selections });
    }

    if (action === "stats") {
      const [titles, selections, rejections] = await Promise.all([
        api("titles?select=id,name&active=eq.true"),
        api("selections?select=title_id,selection_mode,viewing_status,selected_at&order=selected_at.desc"),
        api("session_rejections?select=title_id"),
      ]);
      const rows = titles.map((title) => {
        const ss = selections.filter((x) => x.title_id === title.id);
        const rs = rejections.filter((x) => x.title_id === title.id);
        return {
          title,
          chosen: ss.length,
          no: rs.length,
          limited: ss.filter((x) => x.selection_mode === "limited").length,
          unlimited: ss.filter((x) => x.selection_mode === "unlimited").length,
          completed: ss.filter((x) => x.viewing_status === "presumed_completed").length,
          interrupted: ss.filter((x) => x.viewing_status === "interrupted").length,
          changed: ss.filter((x) => x.viewing_status === "changed").length,
        };
      }).sort((a,b) => b.chosen - a.chosen || a.title.name.localeCompare(b.title.name));
      return response({ rows });
    }

    return response({ error: "Unknown action" }, 400);
  } catch (e) {
    return response({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

