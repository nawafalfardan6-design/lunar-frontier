export const briefings = [
  {speaker:'Maya · habitat engineer',title:'First, make the air safe.',text:'Our lander Selene has touched down on the Moon. The air filter is wearing out. I can fix it today, or help Leo start collecting research. What comes first?'},
  {speaker:'Sam · mission specialist',title:'Prepare before trouble arrives.',text:'We have one free work period. The shelter needs supplies, and the greenhouse needs care. Both jobs will matter later.'},
  {speaker:'Leo · science lead',title:'Is the discovery worth the power?',text:'The instruments are ready in a cold, shaded work area. Their heaters will draw heavily on our battery. Check our reserve before you decide.'},
  {speaker:'Mission control · Earth',title:'Solar alert. Get the crew sheltered.',text:'All four crew members will take cover. Your earlier preparations decide how ready we are. Remote experiments can continue if we can spare the power.'},
  {speaker:'Maya · habitat engineer',title:'A harvest depends on earlier care.',text:'The plants were growing before we arrived. With yesterday’s care and enough light, we may harvest a small crop. Our packaged meals are still available.'},
  {speaker:'Leo · science lead',title:'Send our discoveries home.',text:'Earth is listening. We can send our findings now, or service the ship and use our final downlink tomorrow.'},
  {speaker:'Sam · mission specialist',title:'Prepare the ship for departure.',text:'Our week is almost over. Check the crew and habitat, or send any research still waiting. Our report will show what your decisions achieved.'},
];

export function enableTouchStick(keys) {
  const pad=document.querySelector('#touch > div');
  pad.innerHTML='<div id="joystick" role="group" aria-label="Movement joystick"><span id="stick"></span><small>MOVE</small></div>';
  const joystick=document.getElementById('joystick');
  const stick=document.getElementById('stick');
  const directions=['KeyW','KeyA','KeyS','KeyD'];
  function reset(){directions.forEach(key=>keys.delete(key));stick.style.transform='translate(0,0)';}
  function move(event){
    const rect=joystick.getBoundingClientRect();
    let x=(event.clientX-rect.left-rect.width/2)/40;
    let y=(event.clientY-rect.top-rect.height/2)/40;
    const length=Math.max(1,Math.hypot(x,y));x/=length;y/=length;
    reset();
    if(x<-.2)keys.add('KeyA');if(x>.2)keys.add('KeyD');
    if(y<-.2)keys.add('KeyW');if(y>.2)keys.add('KeyS');
    stick.style.transform=`translate(${x*35}px,${y*35}px)`;
  }
  joystick.onpointerdown=event=>{event.preventDefault();joystick.setPointerCapture(event.pointerId);move(event);};
  joystick.onpointermove=event=>{if(joystick.hasPointerCapture(event.pointerId))move(event);};
  joystick.onpointerup=reset;joystick.onpointercancel=reset;joystick.onlostpointercapture=reset;
}
