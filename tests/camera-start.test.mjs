import assert from 'node:assert/strict';
import {CameraStartFlow} from '../camera-start-flow.js';
import {GestureGate} from '../camera-movement-core.js';
const f=new CameraStartFlow();f.start(1000);assert.equal(f.tick(5999),null);assert.equal(f.answer('yes'),null);assert.equal(f.tick(6000),'ask');assert.equal(f.tick(6001),null);assert.equal(f.answer('uncertain'),null);assert.equal(f.answer('yes'),'start');assert.equal(f.answer('yes'),null);
f.start(0);f.tick(5000);assert.equal(f.answer('no'),'wait');assert.equal(f.answer('yes'),null);f.stop();assert.equal(f.tick(100000),null);
const gate=new GestureGate();for(let at=0;at<=400;at+=100)gate.update('rest',at);let yes=0;for(let at=500;at<=2000;at+=100)if(gate.update('yes',at)==='yes')yes++;assert.equal(yes,1);gate.update('missing',2100);assert.equal(gate.update('yes',2900),null);
console.log('Camera startup and gesture gate checks passed');
