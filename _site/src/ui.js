// ============================================================
// UI レイヤー（DOM）
// Canvas は世界、DOM は HUD。数字はとにかくデカく。
// ============================================================

import { CFG } from './config.js';
import { RARITY } from './config.js';
import { Meta, META_UPGRADES } from './meta.js';
import { SFX } from './audio.js';
import { clamp } from './rng.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      score: $('score'), best: $('best'),
      timeFill: $('timeFill'), timeNum: $('timeNum'),
      hpFill: $('hpFill'),
      comboWrap: $('comboWrap'), comboNum: $('comboNum'), comboMul: $('comboMul'),
      lvNum: $('lvNum'), xpFill: $('xpFill'),
      feverFill: $('feverFill'), feverRow: $('feverRow'), feverLabel: $('feverLabel'),
      banner: $('banner'), warn: $('warn'),
      title: $('title'), titleBest: $('titleBest'), titleCoins: $('titleCoins'),
      levelup: $('levelup'), cards: $('cards'), lvTitle: $('lvTitle'),
      result: $('result'), rScore: $('rScore'), rHook: $('rHook'), rGrid: $('rGrid'),
      rBest: $('rBest'), retry: $('retry'), shop: $('shop'), shopCoins: $('shopCoins'),
      mute: $('mute'),
    };
    this.lastCombo = -1;
    this.bannerT = 0;
    this.warnT = 0;
  }

  // ------------------------------------------------------------------
  update(g) {
    const e = this.el;
    e.score.textContent = fmt(g.displayScore);

    const timeR = clamp(g.timeLeft / CFG.run.time, 0, 1);
    e.timeFill.style.transform = `scaleX(${timeR})`;
    e.timeFill.classList.toggle('low', g.timeLeft <= 10);
    e.timeNum.textContent = Math.ceil(g.timeLeft);
    e.timeNum.classList.toggle('low', g.timeLeft <= 10);

    e.hpFill.style.transform = `scaleX(${clamp(g.hp / g.maxHp, 0, 1)})`;
    e.hpFill.classList.toggle('low', g.hp / g.maxHp < 0.34);

    // コンボ
    if (g.combo !== this.lastCombo) {
      this.lastCombo = g.combo;
      const tier = CFG.comboTiers[g.comboTierIndex()];
      if (g.combo >= 2) {
        e.comboWrap.classList.add('on');
        e.comboNum.textContent = g.combo;
        e.comboMul.textContent = `x${tier.mul}`;
        e.comboWrap.style.setProperty('--cc', tierColor(g.comboTierIndex()));
        e.comboNum.classList.remove('pop');
        void e.comboNum.offsetWidth;
        e.comboNum.classList.add('pop');
      } else {
        e.comboWrap.classList.remove('on');
      }
    }
    // コンボ残量（切れそう感）
    if (g.combo >= 2) {
      e.comboWrap.style.setProperty('--ct', clamp(g.comboTimer / g.stats.comboTime, 0, 1));
    }

    e.lvNum.textContent = `LV ${g.level}`;
    e.xpFill.style.transform = `scaleX(${clamp(g.exp / g.expNeed, 0, 1)})`;

    const fr = g.inFever ? g.feverT / (CFG.fever.duration + g.stats.feverBonus) : g.fever / CFG.fever.max;
    e.feverFill.style.transform = `scaleX(${clamp(fr, 0, 1)})`;
    e.feverRow.classList.toggle('active', g.inFever);
    e.feverRow.classList.toggle('near', !g.inFever && fr > 0.75);
    e.feverLabel.textContent = g.inFever ? 'FEVER!!' : 'FEVER';

    // バナー / 予告の自動フェード
    if (this.bannerT > 0) {
      this.bannerT -= 1 / 60;
      if (this.bannerT <= 0) e.banner.classList.remove('on');
    }
  }

  // ------------------------------------------------------------------
  banner(text, color, sub = '') {
    const e = this.el.banner;
    e.innerHTML = `<div class="bt">${text}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`;
    e.style.setProperty('--bc', color);
    e.classList.remove('on'); void e.offsetWidth; e.classList.add('on');
    this.bannerT = 1.6;
  }

  clearBannerIf() { /* バナーは時間で自動的に消える */ }

  warn(label, sec, color) {
    const e = this.el.warn;
    e.innerHTML = `<span class="wl">${label}</span><span class="wn">${sec}</span>`;
    e.style.setProperty('--wc', color);
    e.classList.add('on');
    e.classList.remove('tick'); void e.offsetWidth; e.classList.add('tick');
  }

  clearWarn() { this.el.warn.classList.remove('on'); }

  clearBanners() { this.el.banner.classList.remove('on'); this.el.warn.classList.remove('on'); }

  // ------------------------------------------------------------------
  showTitle(g) {
    this.el.title.classList.add('on');
    this.el.hud.classList.remove('on');
    this.el.titleBest.textContent = `BEST  ${fmt(Meta.data.best)}`;
    this.el.titleCoins.textContent = `🪙 ${fmt(Meta.data.coins)}`;
  }

  hideTitle() {
    this.el.title.classList.remove('on');
    this.el.hud.classList.add('on');
  }

  // ------------------------------------------------------------------
  showCards(choices, hasLegend, onPick) {
    const wrap = this.el.cards;
    wrap.innerHTML = '';
    this.el.lvTitle.textContent = 'LEVEL UP!';
    this.el.levelup.classList.toggle('legend', hasLegend);
    choices.forEach((u, i) => {
      const r = RARITY[u.r];
      const card = document.createElement('button');
      card.className = `card r-${u.r}`;
      card.style.setProperty('--rc', r.color);
      card.style.setProperty('--rg', r.glow);
      card.style.animationDelay = `${i * 70}ms`;
      const lvl = 0;
      card.innerHTML = `
        <div class="crar">${r.name}</div>
        <div class="cicon">${u.icon}</div>
        <div class="cbody">
          <div class="cname">${u.name}</div>
          <div class="cdesc">${u.desc}</div>
        </div>
        <div class="cglow"></div>`;
      card.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (this._picking) return;
        this._picking = true;
        card.classList.add('picked');
        setTimeout(() => { this._picking = false; onPick(u); }, 110);
      });
      wrap.appendChild(card);
    });
    this.el.levelup.classList.add('on');
  }

  hideCards() { this.el.levelup.classList.remove('on'); }

  // ------------------------------------------------------------------
  showResult(res, info, g) {
    const e = this.el;
    e.rScore.textContent = fmt(res.score);
    e.rGrid.innerHTML = [
      ['MAX COMBO', `x${res.maxCombo}`, info.newCombo],
      ['DESTROYED', fmt(res.destroyed), info.newDestroyed],
      ['LEVEL', res.level, false],
      ['COINS', `🪙 ${fmt(res.coins)}`, false],
    ].map(([k, v, isNew]) => `
      <div class="rcell${isNew ? ' new' : ''}">
        <div class="rk">${k}</div>
        <div class="rv">${v}</div>
        ${isNew ? '<div class="rnew">NEW!</div>' : ''}
      </div>`).join('');

    e.rBest.textContent = `BEST  ${fmt(Meta.data.best)}`;

    // ---- もう一度やりたくなる一言 ----
    let hook, cls = '';
    if (info.newBest) { hook = '🎉 NEW BEST SCORE!!'; cls = 'best'; }
    else if (info.prevBest > 0) {
      const pct = ((info.prevBest - res.score) / info.prevBest) * 100;
      if (pct <= 3) { hook = `自己ベストまで あと ${pct.toFixed(1)}% !!`; cls = 'close'; }
      else if (pct <= 15) { hook = `自己ベストまで あと ${Math.ceil(pct)}%`; cls = 'close'; }
      else if (info.newCombo) hook = '🔥 過去最高コンボ更新!';
      else hook = `あと ${fmt(info.prevBest - res.score)} でベスト更新`;
    } else hook = '次はもっと壊せる';
    e.rHook.textContent = hook;
    e.rHook.className = `rhook ${cls}`;

    this.renderShop(g);
    e.result.classList.add('on');
    e.hud.classList.remove('on');
  }

  hideResult() { this.el.result.classList.remove('on'); }

  renderShop(g) {
    const e = this.el;
    e.shopCoins.textContent = `🪙 ${fmt(Meta.data.coins)}`;
    e.shop.innerHTML = '';
    META_UPGRADES.forEach((u) => {
      const lv = Meta.lv(u.id);
      const cost = Meta.costOf(u.id);
      const can = Meta.canBuy(u.id);
      const b = document.createElement('button');
      b.className = `shopitem${cost === null ? ' maxed' : can ? ' can' : ''}`;
      b.innerHTML = `
        <div class="si-icon">${u.icon}</div>
        <div class="si-main">
          <div class="si-name">${u.name}</div>
          <div class="si-desc">${u.desc}</div>
          <div class="si-dots">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <div class="si-cost">${cost === null ? 'MAX' : `🪙${fmt(cost)}`}</div>`;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        if (Meta.buy(u.id)) { SFX.pickup(2); this.renderShop(g); }
        else SFX.warn();
      });
      e.shop.appendChild(b);
    });
  }
}

function tierColor(i) {
  return ['#ffffff', '#7fe9ff', '#7dff9b', '#ffe14d', '#ff8a3d', '#ff5aa8', '#c07bff', '#ffcf3f'][i] || '#fff';
}
