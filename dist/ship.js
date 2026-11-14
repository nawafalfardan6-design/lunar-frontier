import * as T from './vendor/three.module.js';

export const shipStations = [
  {name:'Life support',x:-5.8,z:-6},
  {name:'Crew shelter',x:-5.8,z:6},
  {name:'Science station',x:5.8,z:-5},
  {name:'Crew shelter',x:-5.8,z:6},
  {name:'Greenhouse',x:5.8,z:5},
  {name:'Communications',x:3,z:-10.5},
  {name:'Flight deck',x:-3,z:-10.5},
];

export function buildShip(scene,box,mesh,mat,obstacle) {
  const hull=0x586d7a, trim=0x283b49, wall=0xa2b0b5;
  box(19,0.3,28,trim,0,-0.15,0);
  box(19,0.3,28,trim,0,5.2,0);
  for(let z=-12;z<=12;z+=3) {
    box(17.5,0.04,2.92,0x607582,0,0.02,z);
    box(0.09,0.05,2.6,0xc8ad7d,-2.8,0.05,z);
    box(0.09,0.05,2.6,0xc8ad7d,2.8,0.05,z);
  }
  // Front and side windows open onto the lunar surface outside the lander.
  box(19,1.4,0.4,wall,0,0.7,-13.5);
  box(19,0.9,0.4,wall,0,4.75,-13.5);
  for(const x of [-9,-4.5,0,4.5,9]) box(0.25,3.2,0.5,trim,x,2.9,-13.5);
  box(19,5.2,0.4,wall,0,2.6,13.5);
  for(const side of [-1,1]) {
    box(0.4,1.4,27,wall,side*9,0.7,0);
    box(0.4,0.9,27,wall,side*9,4.75,0);
    for(let z=-12;z<=12;z+=4) {
      box(0.5,5.2,0.22,trim,side*9,2.6,z);
      box(0.18,0.22,27,hull,side*8.8,1.4,0);
    }
  }
  for(let z=-10;z<=10;z+=5) {
    box(18,0.25,0.3,hull,0,4.9,z);
    const light=mesh(new T.BoxGeometry(5,0.06,0.26),new T.MeshBasicMaterial({color:0xd6f4ef}),0,4.73,z);
    const lamp=new T.PointLight(0xc5e9e4,18,16,1.2);
    lamp.position.set(0,4,z);scene.add(lamp);
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
  // Habitat hardware gives each station a distinct purpose and silhouette.
  for(const x of [-7.9,-6.9]) {
    mesh(new T.CylinderGeometry(0.35,0.35,2.8,16),mat(0xb6c8c9),x,1.4,-7);
    box(0.7,0.12,0.7,0x80b4ac,x,0.8,-7);
    box(0.7,0.12,0.7,0x80b4ac,x,2.1,-7);
  }
  obstacle(-7.4,-7,2,1);
  for(const z of [5,8]) {
    box(2,0.3,2.2,trim,-7.4,0.55,z);
    box(1.7,0.15,1.8,0x8aabb6,-7.4,0.78,z);
    box(1.3,0.2,0.45,0xd3dcdb,-7.4,0.94,z-0.5);
    obstacle(-7.4,z,2,2.2);
  }
  for(let z=3;z<=7;z+=2) {
    box(1.5,0.8,1.5,trim,7.5,0.4,z);
    for(const dx of [-0.35,0.35])mesh(new T.ConeGeometry(0.32,0.8,7),mat(0x82b68b),7.5+dx,1.15,z);
    obstacle(7.5,z,1.5,1.5);
  }
  box(1.8,0.6,1.5,0x7a939f,7.1,0.6,-6);
  mesh(new T.CylinderGeometry(0.32,0.4,0.8,12),mat(0xd1bb89),7.1,1.3,-6);
  obstacle(7.1,-6,1.8,1.5);
}
