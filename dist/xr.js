import * as T from './vendor/three.module.js';

export function astronautGlove() {
  const glove = new T.Group();
  const fabric = new T.MeshStandardMaterial({color:0xe5e8ec, roughness:1});
  const cuff = new T.MeshStandardMaterial({color:0x53677c, roughness:1});
  const trim = new T.MeshStandardMaterial({color:0x8b929a, roughness:1});
  function part(size, xyz, material) {
    const mesh = new T.Mesh(new T.SphereGeometry(0.5,16,12), material);
    mesh.scale.set(...size);
    mesh.position.set(...xyz);
    glove.add(mesh);
  }
  part([0.087,0.055,0.095],[0,0,-0.015],fabric);
  part([0.095,0.065,0.086],[0,0,0.077],cuff);
  part([0.095,0.066,0.018],[0,0,0.043],trim);
  for(let i=0;i<4;i++) part([0.018,0.032,0.045],[(i-1.5)*0.021,-0.004,-0.077],fabric);
  part([0.026,0.038,0.050],[-0.051,-0.006,-0.019],fabric);
  return glove;
}

export function createXR({ renderer, scene, camera, dialog, modal, interact, position, move, status }) {
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  const rig = new T.Group();
  scene.add(rig);
  rig.add(camera);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const panel = new T.Mesh(new T.PlaneGeometry(1.7, 1.275), new T.MeshBasicMaterial({ map: texture, toneMapped: false }));
  scene.add(panel);
  panel.visible = false;
  const ray = new T.Raycaster();
  const rotation = new T.Matrix4();
  const head = new T.Vector3();
  const direction = new T.Vector3();
  const viewRotation = new T.Quaternion();
  let buttons = [];
  let lastContent = '';
  let turnReady = true;

  function pointPanel() {
    const view = renderer.xr.getCamera();
    view.getWorldPosition(head);
    view.getWorldDirection(direction);
    view.getWorldQuaternion(viewRotation);
    panel.position.copy(head).addScaledVector(direction, 2);
    panel.quaternion.copy(viewRotation);
    panel.updateMatrixWorld();
  }

  function updatePanel() {
    const inDialog = dialog.open;
    const text = inDialog ? modal.innerText : status();
    if (text === lastContent) return;
    if (!lastContent || inDialog) pointPanel();
    lastContent = text;
    ctx.fillStyle = '#28263d';
    ctx.fillRect(0, 0, 1024, 768);
    ctx.fillStyle = '#f5e7c9';
    ctx.font = '29px Arial';
    const actionButtons = inDialog ? [...modal.querySelectorAll('button')] : [];
    const body = inDialog ? (modal.querySelector('h1,h2')?.innerText || '') + '\n' + [...modal.querySelectorAll('p,li')].slice(0, 7).map(p => p.innerText).join('\n') : text;
    let y = 52;
    const limit = 732 - actionButtons.length * 68;
    for (const paragraph of body.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        if (line && ctx.measureText(`${line} ${word}`).width > 914) {
          if (y < limit) ctx.fillText(line, 50, y);
          y += 36;
          line = word;
        } else line += `${line ? ' ' : ''}${word}`;
      }
      if (y < limit) ctx.fillText(line, 50, y);
      y += 40;
    }
    buttons = actionButtons.map((button, index) => {
      const top = 748 - (actionButtons.length - index) * 68;
      ctx.fillStyle = '#f5b574';
      ctx.fillRect(46, top, 932, 54);
      ctx.fillStyle = '#28263d';
      ctx.fillText(button.firstChild?.textContent.trim() || button.innerText, 64, top + 36, 890);
      return { button, top };
    });
    texture.needsUpdate = true;
  }

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    rig.add(controller);
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(astronautGlove());
    rig.add(grip);
    const line = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, -3)]), new T.LineBasicMaterial({ color: 0xffc679 }));
    controller.add(line);
    controller.addEventListener('select', () => {
      if (!dialog.open) { interact(); lastContent = ''; return; }
      rotation.identity().extractRotation(controller.matrixWorld);
      ray.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ray.ray.direction.set(0, 0, -1).applyMatrix4(rotation);
      const hit = ray.intersectObject(panel)[0];
      if (!hit || hit.uv.x < 0.045 || hit.uv.x > 0.955) return;
      const y = (1 - hit.uv.y) * 768;
      buttons.find(button => y >= button.top && y <= button.top + 54)?.button.click();
    });
  }

  renderer.xr.addEventListener('sessionend', () => {
    panel.visible = false;
    rig.position.set(0, 0, 0);
    rig.rotation.y = 0;
    lastContent = '';
  });

  return {
    async supported() { return !!(await navigator.xr?.isSessionSupported('immersive-vr')); },
    async enter() {
      const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'] });
      try { await renderer.xr.setSession(session); } catch (error) { await session.end(); throw error; }
      turnReady = true;
      panel.visible = true;
      lastContent = '';
    },
    update(dt) {
      const session = renderer.xr.getSession();
      if (!dialog.open) {
        for (const input of session.inputSources) {
          const axes = input.gamepad?.axes;
          if (!axes || axes.length < 2) continue;
          const x = axes.at(-2), y = axes.at(-1);
          if (input.handedness === 'left') {
            const angle = rig.rotation.y;
            const strafe = Math.abs(x) > 0.18 ? x : 0;
            const forward = Math.abs(y) > 0.18 ? y : 0;
            move((strafe * Math.cos(angle) + forward * Math.sin(angle)) * dt * 2, (forward * Math.cos(angle) - strafe * Math.sin(angle)) * dt * 2);
          } else if (input.handedness === 'right') {
            if (Math.abs(x) < 0.3) turnReady = true;
            if (turnReady && Math.abs(x) > 0.75) { rig.rotation.y -= Math.sign(x) * Math.PI / 6; turnReady = false; lastContent = ''; }
          }
        }
      }
      rig.position.set(position.x, 0, position.z);
      rig.updateMatrixWorld(true);
      updatePanel();
      if (!dialog.open) pointPanel();
    },
  };
}
