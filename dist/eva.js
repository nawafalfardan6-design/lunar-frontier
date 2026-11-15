import * as T from './vendor/three.module.js';
import { newExpedition, evaAction, evaTick, EVA_ACTIONS } from './eva-model.js';
import { saveMission } from './mission-session.js';
import { findRoute } from './navigation.js';
import { surfaceTexture } from './surfaces.js';

const HATCH = { name: 'Airlock · suit & supplies', x: 0, z: 11.5 };
const ICE = { name: 'Sealed science cache · ice', x: -6, z: 30 };
const ROCK = { name: 'Marked Moon rocks · research', x: 8, z: 35 };
const HOME = { name: 'Airlock · return to safety', x: 0, z: 17 };
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createEva(ctx) {
  const { stage, player } = ctx;
  let returning = false;
  let follow = [], transitioning = false, alarmMuted = false, clock = 0, last = '';
  const panel = document.createElement('aside');
  panel.id = 'eva-status';
  panel.setAttribute('aria-label', 'Expedition resources');
  document.body.append(panel);
  const objectivePanel = document.getElementById('objective');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--mission-bottom', `${objectivePanel.getBoundingClientRect().bottom + 10}px`);
  }).observe(objectivePanel);
  const tools = document.createElement('div');
  tools.id = 'eva-tools';
  tools.innerHTML = '<button id="eva-follow">Follow objective</button><button id="eva-home">Go to airlock</button><button id="eva-supplies">Airlock & supplies</button><button id="eva-alarm">Quiet alarm</button>';
  document.body.append(tools);
  const flash = document.createElement('div');
  flash.id = 'eva-alarm-light'; flash.setAttribute('aria-hidden', 'true');
  document.body.append(flash);
  const visuals = buildSurface(stage.scene);
  const oldClear = ctx.clearAt;
  ctx.clearAt = (x, z) => ctx.state.expedition?.outside
    ? Math.abs(x) < 14 && z > 16 && z < 43
    : oldClear(x, z);
  const persist = () => { if (!saveMission(ctx.state)) panel.dataset.unsaved = 'true'; };
  const exp = () => ctx.state.expedition;
  function target() {
    const e = exp();
    if (!e || ctx.state.ended) return null;
    if (!e.outside) return e.complete ? null : HATCH;
    if (returning || e.suit < 15 || (!e.complete && e.ice > 0) || !e.rocksLeft) return HOME;
    return e.iceLeft ? ICE : ROCK;
  }
  function nearby() {
    if (!exp()?.outside) return HATCH;
    return [HOME, ICE, ROCK].sort((a,b) => Math.hypot(a.x-player.x,a.z-player.z)-Math.hypot(b.x-player.x,b.z-player.z))[0];
  }
  function opening(step = 0) {
    const pages = [
      ['Welcome to Lunar Frontier!', 'You are the commander of Selene. Your crew has just landed on the Moon.'],
      ['Seven Earth days. One crew.', 'Your ride home arrives in seven Earth days. Complete daily jobs and keep your crew safe. We landed late in lunar daytime: sunset comes on mission Day 6.'],
      ['First job: restore the air reserve', 'The backup air tank is low. Suit up, recover sealed ice from the nearby science cache, and turn it into water and oxygen.'],
    ];
    ctx.hud.show(`<h2>${pages[step][0]}</h2><p>${pages[step][1]}</p><button id="eva-next">${step < 2 ? 'Next →' : 'Start the rescue →'}</button>`);
    document.getElementById('eva-next').onclick = () => {
      if (step < 2) opening(step + 1);
      else {
        if (!exp()) ctx.state.expedition = newExpedition();
        ctx.controls.reset(); persist(); ctx.hud.updateMeters(); ctx.hud.resume();
      }
    };
  }
  function apply(id) {
    const wasComplete = exp().complete;
    const result = evaAction(ctx.state, id);
    if (!result.ok) { showPanel(result.message); return; }
    ctx.state = result.state;
    follow = [];
    if (id === 'exit' || id === 'enter') {
      returning = false;
      transitioning = true; ctx.playing = false;
      stage.setHatch(true);
      ctx.hud.show('<h2>Airlock cycling</h2><p>One door seals before the other opens.</p>');
      setTimeout(() => {
        const outside = exp().outside;
        ctx.controls.place(0, outside ? 18 : 11, outside ? Math.PI : 0);
        stage.setHatch(false); transitioning = false;
        persist(); ctx.hud.resume();
      }, 900);
    } else if (!wasComplete && exp().complete) {
      ctx.hud.show('<h2>Air reserve restored!</h2><p>You used Battery to turn ice into water, then water into oxygen. Now begin Day 1 at the air-recycling terminal. Each shift uses 4 base oxygen and 1 meal-day. Optional jobs: collect Moon rocks for Science, or spend water and Battery to grow food.</p><button id="eva-done">Begin the seven-day mission →</button>');
      document.getElementById('eva-done').onclick = ctx.hud.resume;
    } else showPanel(result.message);
    persist(); ctx.hud.updateMeters();
  }
  function showPanel(message = '') {
    const e = exp();
    if (!e || ctx.state.ended || transitioning) return;
    let ids;
    if (e.outside) {
      const near = nearby();
      if (Math.hypot(near.x-player.x,near.z-player.z) > 3.5) {
        ctx.hud.show('<h2>Keep an eye on your oxygen</h2><p>Follow the marker to the cache, rocks or airlock. Below 15 oxygen, return immediately. An empty suit triggers crew rescue and costs 5 Crew Safety.</p><button id="eva-close">Back to the surface</button>');
        document.getElementById('eva-close').onclick = ctx.hud.resume; return;
      }
      ids = near === HOME ? ['enter'] : near === ICE ? ['ice'] : ['rock'];
    } else if (!e.complete) {
      if (!e.suited) ids = ['suit', 'assist'];
      else if (e.iceLeft) ids = ['fill', 'exit', 'assist'];
      else if (!e.melted) ids = ['melt'];
      else ids = ['oxygen'];
    } else ids = ['fill','exit', ...(e.ice ? ['melt'] : []), 'oxygen', 'plants', ...(e.rocks ? ['scan'] : [])];
    const buttons = ids.map(id => `<button data-eva="${id}" data-short="${esc(EVA_ACTIONS[id].join(' · '))}"><strong>${EVA_ACTIONS[id][0]}</strong><small>${EVA_ACTIONS[id][1]}</small></button>`).join('');
    ctx.hud.show(`<section class="eva-panel"><h2>${e.outside ? nearby().name : 'Airlock & supplies'}</h2><p>${!e.complete ? 'Restore the base air: suit → fill → ice cache → return → melt → make oxygen.' : `Optional survey: ${e.scans}/2 rocks analysed. Use water for oxygen or food. Each option costs Battery.`}</p><p>${resourceText()}</p>${message ? `<p role="status">${esc(message)}</p>` : ''}<p>Suit oxygen runs down only outside: 0.3/s outside, 0.6/s while sprinting. Base oxygen and food are used at shift end. Battery powers processing. These are game units; Life Support is system health. An empty suit costs 5 Crew Safety for rescue.</p><div class="eva-actions">${buttons}</div><button id="eva-close">${e.outside ? 'Back to surface' : 'Back to cabin'}</button></section>`);
    document.querySelectorAll('[data-eva]').forEach(button => button.onclick = () => {
      const id = button.dataset.eva;
      if (id === 'exit' && Math.hypot(player.x, player.z-HATCH.z) > 3.5) {
        showPanel('Walk to the orange rear airlock, or use Follow objective.'); return;
      }
      apply(id);
    });
    document.getElementById('eva-close').onclick = ctx.hud.resume;
  }
  function resourceText() {
    const e = exp();
    return `Battery ${ctx.state.power} · base O₂ ${Math.floor(e.oxygen)}/200 · suit ${Math.ceil(e.suit)}/40 · water ${e.water} · meals ${e.food} days · ice ${e.ice} · rocks ${e.rocks}`;
  }
  document.getElementById('eva-home').onclick = () => {
    if (ctx.dialog.open || transitioning || !exp()) return;
    returning = true;
    follow = exp().outside ? [{x:HOME.x,z:HOME.z}] : findRoute(player,HATCH,oldClear);
  };
  document.getElementById('eva-supplies').onclick = () => showPanel();
  document.getElementById('eva-alarm').onclick = event => {
    alarmMuted = !alarmMuted;
    event.target.textContent = alarmMuted ? 'Show alarm' : 'Quiet alarm';
  };
  document.getElementById('eva-follow').onclick = () => {
    if (ctx.dialog.open || transitioning || !exp()) return;
    returning = false;
    const goal = target() || ctx.stations.find(station => station.name === days[Math.min(ctx.state.day,days.length-1)].station) || HATCH;
    follow = exp().outside ? [{x:goal.x,z:goal.z}] : findRoute(player, goal, oldClear);
  };
  document.addEventListener('keydown', event => {
    if (['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) follow = [];
  });
  ctx.canvas.addEventListener('pointerdown', () => { follow = []; });
  document.getElementById('touch').addEventListener('pointerdown', () => { follow = []; });
  window.addEventListener('pagehide', persist);
  return {
    opening, target, showPanel,
    intercept() {
      const e = exp();
      if (!e || ctx.state.ended) return false;
      if (!e.complete || e.outside || Math.hypot(player.x, player.z-HATCH.z) < 3) { showPanel(); return true; }
      return false;
    },
    reset() {
      follow = []; returning = false; alarmMuted = false;
      ctx.state.expedition = newExpedition(); ctx.controls.reset(); persist(); opening();
    },
    restore() {
      const e = exp();
      if (e?.outside) ctx.controls.place(e.position[0], e.position[1], Math.PI);
    },
    update(dt) {
      const e = exp(), active = !!e && !ctx.inMenu && !ctx.state.ended;
      panel.hidden = tools.hidden = !active;
      document.getElementById('eva-supplies').textContent = e?.outside ? 'Inspect nearby' : 'Airlock & supplies';
      const alarm = active && !e.complete;
      document.getElementById('eva-alarm').hidden = !alarm;
      document.body.classList.toggle('eva-alert', alarm && !alarmMuted);
      document.body.classList.toggle('eva-outside', !!e?.outside);
      document.body.classList.toggle('eva-training', active && !e.complete);
      visuals.ice.visible = !!e?.iceLeft; visuals.rocks.visible = !!e?.rocksLeft;
      if (!active) return;
      if (ctx.playing && !ctx.dialog.open && !transitioning && !document.hidden) {
        const outside = e.outside;
        ctx.state = evaTick(ctx.state, dt, ctx.keys.has('ShiftLeft') || ctx.keys.has('ShiftRight'));
        if (outside && !exp().outside) {
          follow = []; ctx.controls.place(0,11,0); showPanel(exp().notice); persist();
        }
        if (follow.length) {
          const p = follow[0], dx = p.x-player.x, dz = p.z-player.z, d = Math.hypot(dx,dz);
          if (d < (follow.length === 1 && exp().outside ? 2 : 0.3)) follow.shift();
          else { const step = Math.min(d, dt*3); ctx.controls.face(p.x,p.z); ctx.controls.move(dx/d*step,dz/d*step); }
        }
        if (exp().outside) exp().position = [player.x,player.z];
        clock += dt;
        if (clock > 3) { clock = 0; persist(); }
      }
      const text = resourceText();
      const goal = target();
      const html = `<strong>${exp().outside ? (exp().suit < 15 ? 'LOW SUIT OXYGEN — RETURN NOW' : 'SURFACE EXPEDITION') : !exp().complete ? 'AIR RESERVE LOW · RESTORE THE BACKUP TANK' : 'CREW SUPPLIES'}</strong><span>${text}</span><small>${goal ? esc(goal.name) : 'Each shift: −4 base O₂, −1 meal-day. Supply shortage: −5 Crew Safety.'}</small>`;
      if (html !== last) { panel.innerHTML = html; last = html; }
      if (!exp().complete || exp().outside) {
        const current = exp();
        const instruction = current.outside
          ? (goal === HOME ? 'Return to the airlock. Press E nearby to enter.' : 'Follow the marker. Press E nearby to collect.')
          : !current.suited ? '1/5 · Press E to put on your spacesuit.'
          : current.iceLeft && current.suit < 15 ? '1/5 · Press E to fill your suit tank.'
          : current.iceLeft ? '2/5 · Go to the rear airlock. Press E to open it.'
          : !current.melted ? '4/5 · Press E to melt one ice sample.'
          : '5/5 · Press E to make breathing oxygen.';
        document.getElementById('objective').innerHTML = `<h2>${current.outside ? 'Collect, then return safely' : 'First mission: restore the air'}</h2><p>${instruction}</p>`;
        document.getElementById('interact').disabled = false;
      }
      document.getElementById('interact').textContent = !exp().complete || exp().outside ? 'Interact · E' : 'Use terminal';
    },
  };
}

function buildSurface(scene) {
  const group = new T.Group(); scene.add(group);
  const mesh = (geometry,color,x,y,z) => {
    const m = new T.Mesh(geometry,new T.MeshStandardMaterial({color,roughness:0.95}));
    m.position.set(x,y,z); m.receiveShadow=true; group.add(m); return m;
  };
  // A graded work area around the original rear airlock; terrain beyond is decorative.
  const ground = mesh(new T.BoxGeometry(30,0.16,29),0x88827c,0,-0.08,29.5);
  const texture = surfaceTexture('moon').clone();
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(5,5);
  texture.needsUpdate = true;
  ground.material.map = texture;
  for(let i=0;i<16;i++) {
    const x=i%2 ? -13 : 13, z=18+Math.floor(i/2)*3;
    mesh(new T.CylinderGeometry(0.08,0.08,0.7,6),0xe5af53,x,0.35,z);
  }
  for(let i=0;i<8;i++) mesh(new T.BoxGeometry(0.2,0.02,0.7),0x79d5df,-i*0.65,0.03,18+i*1.3);
  const ice=mesh(new T.BoxGeometry(1.5,0.9,1),0x6ecadd,ICE.x,0.45,ICE.z);
  mesh(new T.CylinderGeometry(0.04,0.04,2.6,6),0xddddcc,ICE.x+1,1.3,ICE.z);
  mesh(new T.BoxGeometry(0.8,0.5,0.05),0x55ddff,ICE.x+1.4,2.4,ICE.z);
  const rocks=new T.Group(); group.add(rocks);
  for(let i=0;i<3;i++) {
    const rock=mesh(new T.DodecahedronGeometry(0.35+i*0.07),0x625e58,ROCK.x+i*0.45,0.3,ROCK.z);
    rocks.attach(rock);
  }
  mesh(new T.TorusGeometry(1.6,0.04,6,32),0xffc469,ROCK.x,0.04,ROCK.z).rotation.x=-Math.PI/2;
  return {ice,rocks};
}
