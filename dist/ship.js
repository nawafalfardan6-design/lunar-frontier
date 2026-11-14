import * as T from './vendor/three.module.js';

export const shipStations = [
 {name:'Air recycling',x:-5,z:-8}, {name:'Storm shelter',x:5,z:0},
 {name:'Power bay',x:5,z:-8}, {name:'Storm shelter',x:5,z:0},
 {name:'Food & water',x:-5,z:0}, {name:'Water recovery',x:-5,z:8},
 {name:'Flight deck',x:5,z:8}
];

export function buildShip(scene,box,mesh,mat,obstacle) {
  const hull=0x586d7a, trim=0x283b49, wall=0xa2b0b5;
  box(19,0.3,28,trim,0,-0.15,0);
  box(19,0.3,28,trim,0,3.5,0);
  for(let z=-12;z<=12;z+=3) {
    box(17.5,0.04,2.92,0x607582,0,0.02,z);
    box(0.09,0.05,2.6,0xc8ad7d,-2.8,0.05,z);
    box(0.09,0.05,2.6,0xc8ad7d,2.8,0.05,z);
  }
  // Front and side windows open onto the lunar surface outside the lander.
  box(19,1.4,0.4,wall,0,0.7,-13.5);
  box(19,0.5,0.4,wall,0,3.25,-13.5);
  for(const x of [-9,-4.5,0,4.5,9]) box(0.25,2,0.5,trim,x,2.2,-13.5);
  box(19,3.5,0.4,wall,0,1.75,13.5);
  for(const side of [-1,1]) {
    box(0.4,1.4,27,wall,side*9,0.7,0);
    box(0.4,0.5,27,wall,side*9,3.25,0);
    for(let z=-12;z<=12;z+=4) {
      box(0.5,3.5,0.22,trim,side*9,1.75,z);
      box(0.18,0.22,27,hull,side*8.8,1.4,0);
    }
  }
  for(let z=-10;z<=10;z+=5) {
    box(18,0.25,0.3,hull,0,3.25,z);
    const light=mesh(new T.BoxGeometry(5,0.06,0.26),new T.MeshBasicMaterial({color:0xd6f4ef}),0,3.08,z);
    const lamp=new T.PointLight(0xc5e9e4,18,16,1.2);
    lamp.position.set(0,2.9,z);scene.add(lamp);
  }
  box(2.8,3.8,0.2,trim,0,2,13.2);
  box(0.08,3.6,0.22,0xc6ad7d,0,2,13.06);
  box(2.2,0.12,0.1,0xc6ad7d,0,2.1,12.95);

  function screen(text,x,z,angle,color) {
    const group=new T.Group();group.position.set(x,0,z);group.rotation.y=angle;scene.add(group);
    box(1.6,1,0.9,trim,0,0.5,0,group);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const c=canvas.getContext('2d');c.fillStyle='#102831';c.fillRect(0,0,512,256);
    c.fillStyle=color;c.fillRect(25,24,6,54);c.font='bold 32px sans-serif';c.fillText(text,48,60);
    c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(25,160);
    for(let i=1;i<18;i++)c.lineTo(25+i*26,160-Math.sin(i*1.7)*24);c.stroke();
    c.font='18px monospace';c.fillText('SELENE / SYSTEM CONTROL',25,225);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    mesh(new T.PlaneGeometry(1.65,0.82),new T.MeshBasicMaterial({map:texture}),0,1.5,0.46,group);
    obstacle(x,z,1.6,0.9);
  }
  for(const index of [0,1,2,4,5,6]) {
    const station=shipStations[index];
    screen(station.name.toUpperCase(),station.x,station.z,0,index===1?'#edc68d':'#a5e0d2');
  }
  // Six pressure compartments around a narrow central passage.
  function bulkhead(w,d,x,z) {box(w,3.5,d,wall,x,1.75,z);obstacle(x,z,w,d);}
  for(const x of [-2,2]) {
    for(const z of [-11,-5,-3,3,5,11]) bulkhead(0.22,2,x,z);
    for(const z of [-8,0,8]) {
      box(0.3,0.5,4,trim,x,3.25,z);
      for(const dz of [-2,2])box(0.32,3,0.12,0xc8ad7d,x,1.5,z+dz);
    }
  }
  for(const z of [-4,4])for(const x of [-5.5,5.5])bulkhead(7,0.22,x,z);
  const roomLabels=[['AIR',-2,-8],['POWER',2,-8],['FOOD',-2,0],['SHELTER',2,0],['WATER',-2,8],['FLIGHT',2,8]];
  for(const [label,x,z] of roomLabels){
    const c=document.createElement('canvas');c.width=256;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#1b303a';ctx.fillRect(0,0,256,64);ctx.fillStyle='#d9c7a3';ctx.font='bold 34px sans-serif';ctx.textAlign='center';ctx.fillText(label,128,45);
    const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;
    const plaque=mesh(new T.PlaneGeometry(2.2,0.5),new T.MeshBasicMaterial({map:t}),x+(x<0?0.17:-0.17),2.95,z);plaque.rotation.y=x<0?Math.PI/2:-Math.PI/2;
  }
  // Equipment is secured to outer walls, leaving each doorway clear.
  for(const z of [-9,-7]) {
    mesh(new T.CylinderGeometry(0.4,0.4,2.5,16),mat(0xb6c8c9),-7.8,1.25,z);
    obstacle(-7.8,z,1,1);
  }
  for(const z of [-9,-7]) {
    box(0.8,2.5,1.4,trim,7.8,1.25,z);obstacle(7.8,z,0.8,1.4);
    for(let y=0.5;y<2.5;y+=0.5)box(0.12,0.12,0.8,0xc6ad7d,7.3,y,z);
  }
  for(const y of [0.6,1.8]) {
    box(1.7,0.15,3,trim,7.5,y,0);box(1.5,0.15,2.7,0x8aabb6,7.5,y+0.15,0);
    box(1.2,0.2,0.45,0xd3dcdb,7.5,y+0.3,-0.9);
  }
  obstacle(7.5,0,1.7,3);
  for(const z of [-1,1]) {
    box(1.4,0.8,1.4,trim,-7.5,0.4,z);
    for(const dx of [-0.3,0.3])mesh(new T.ConeGeometry(0.3,0.7,7),mat(0x82b68b),-7.5+dx,1.1,z);
    obstacle(-7.5,z,1.4,1.4);
  }
  for(const z of [7,9]) {
    mesh(new T.CylinderGeometry(0.5,0.5,2,16),mat(0x729cae),-7.5,1,z);
    obstacle(-7.5,z,1,1);
  }
  box(1.2,0.3,1.4,trim,7.2,0.6,9);box(1.2,1.1,0.2,0x8aabb6,7.2,1.1,9.6);obstacle(7.2,9,1.2,1.6);
}
