export class CameraStartFlow{
 constructor(){this.stop();}
 stop(){this.phase='off';this.deadline=null;}
 start(now){this.phase='countdown';this.deadline=now+5000;}
 tick(now){if(this.phase==='countdown'&&now>=this.deadline){this.phase='question';return 'ask';}return null;}
 answer(value){if(this.phase!=='question'||!['yes','no'].includes(value))return null;this.phase=value==='yes'?'started':'waiting';return value==='yes'?'start':'wait';}
}
