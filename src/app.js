/* Milk Metabolite Database — charts and interactions. Needs d3 v7 and data.js (window.MB). */
(function () {
  'use strict';
  const MB = window.MB;
  const body = document.body;
  const ROOT = body.dataset.root || '';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const D = (ms) => (reduce ? 0 : ms);
  const fmt = d3.format('.3~f');
  const fold = (l) => { const r = Math.pow(2, l); return (r >= 10 ? d3.format('.0f')(r) : r >= 1 ? d3.format('.2~f')(r) : d3.format('.2~f')(r)) + '×'; };
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const SCOL = (i) => `var(--s${(i % 6) + 1})`;
  const TCOL = (i) => `var(--t${(i % 4) + 1})`;
  const KCOL = (c) => `var(--k${(Math.max(0, MB.classes.indexOf(c)) % 8) + 1})`;
  const metBy = new Map(MB.mets.map((m) => [m.m, m]));
  const study = (id) => MB.studies.find((s) => s.id === id);
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const ease = d3.easeCubicInOut;

  // ------------------------------------------------------------ tooltip
  const tipEl = document.getElementById('tip');
  const tip = {
    show(title, lines, ev) {
      const h = el('div', 't', title);
      tipEl.replaceChildren(h, ...lines.map((l) => { const r = el('div', 'r'); if (l.color) { const s = el('span', 'sw'); s.style.background = l.color; r.append(s); } r.append(document.createTextNode(l.text)); return r; }));
      tipEl.classList.add('on');
      const w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
      let x = ev.clientX + 14, y = ev.clientY + 14;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
      if (y + hh > window.innerHeight - 8) y = ev.clientY - hh - 14;
      tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
    },
    hide() { tipEl.classList.remove('on'); },
  };
  window.addEventListener('scroll', () => tip.hide(), { passive: true });

  // ------------------------------------------------------------ helpers
  function mount(node, render) {
    let w = 0, drawn = false;
    const api = { draw(anim) { drawn = true; w = Math.max(260, Math.round(node.clientWidth)); render(w, !!anim); } };
    if ('ResizeObserver' in window) new ResizeObserver(() => { const nw = Math.round(node.clientWidth); if (drawn && nw && Math.abs(nw - w) > 2) api.draw(false); }).observe(node);
    return api;
  }
  function svgIn(node, W, H, label) {
    let svg = d3.select(node).select('svg');
    const fresh = svg.empty() || +svg.attr('data-w') !== W;
    if (fresh) { node.replaceChildren(); svg = d3.select(node).append('svg').attr('data-w', W).attr('width', '100%').attr('role', 'img').attr('aria-label', label); }
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    return { svg, fresh };
  }
  function layer(svg, name) { let g = svg.select('g.' + name); if (g.empty()) g = svg.append('g').attr('class', name); return g; }
  function measure(svg, labels, cls) { const t = svg.append('text').attr('class', cls || null); let w = 0; for (const l of labels) { t.text(l); w = Math.max(w, t.node().getComputedTextLength()); } t.remove(); return w; }
  function legend(node, items) { if (!node) return; node.replaceChildren(...items.map(([label, color]) => { const li = el('li'); const s = el('span', 'sw'); s.style.background = color; li.append(s, document.createTextNode(label)); return li; })); }
  function options(sel, values, labels) { sel.replaceChildren(...values.map((v, i) => new Option(labels ? labels[i] : v, v))); }
  function inView(node, fn) {
    if (reduce || !('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(node);
  }

  // ------------------------------------------------------------ components
  // grouped bars: rows {a, b, mean, sd}
  function groupedBars(node, aLv, bLv, opts = {}) {
    let rows = [], first = true;
    const H = opts.height || 300;
    const api = mount(node, (W, anim) => {
      const { svg } = svgIn(node, W, H, opts.label || 'Grouped bar chart');
      const y = d3.scaleLinear([0, d3.max(rows, (d) => d.mean + d.sd) || 1], [H - 28, 10]).nice();
      const ticks = y.ticks(5);
      const m = { l: Math.ceil(measure(svg, ticks.map(fmt))) + 14, r: 6 };
      const x0 = d3.scaleBand(aLv, [m.l, W - m.r]).paddingInner(0.22).paddingOuter(0.06);
      const x1 = d3.scaleBand(bLv, [0, x0.bandwidth()]).padding(0.12);
      const intro = first && !reduce; first = false;
      const dur = intro ? 900 : anim ? D(650) : 0;
      layer(svg, 'grid').selectAll('line').data(ticks).join('line').attr('class', 'grid-l').attr('x1', m.l).attr('x2', W - m.r).transition().duration(dur).ease(ease).attr('y1', y).attr('y2', y);
      layer(svg, 'yl').selectAll('text').data(ticks).join('text').attr('text-anchor', 'end').attr('dy', '0.32em').text(fmt).transition().duration(dur).ease(ease).attr('x', m.l - 8).attr('y', y);
      layer(svg, 'xl').selectAll('text').data(aLv).join('text').attr('class', 'strong').attr('text-anchor', 'middle').attr('y', H - 7).attr('x', (d) => x0(d) + x0.bandwidth() / 2).text((d) => d);
      const bx = (d) => x0(d.a) + x1(d.b), cx = (d) => bx(d) + x1.bandwidth() / 2;
      layer(svg, 'bars').selectAll('rect').data(rows, (d) => d.a + '|' + d.b).join((en) => en.append('rect').attr('y', y(0)).attr('height', 0))
        .attr('x', bx).attr('width', x1.bandwidth()).attr('rx', 4).style('fill', (d) => SCOL(bLv.indexOf(d.b)))
        .on('mousemove', (ev, d) => tip.show(`${opts.name ? opts.name() + ' · ' : ''}${d.a} · ${d.b}`, [{ color: SCOL(bLv.indexOf(d.b)), text: `${fmt(d.mean)} ± ${fmt(d.sd)} mM` }], ev)).on('mouseleave', tip.hide)
        .transition().duration(dur).delay((d, i) => (intro ? 50 * i : 0)).ease(intro ? d3.easeCubicOut : ease)
        .attr('y', (d) => y(d.mean)).attr('height', (d) => Math.max(0, y(0) - y(d.mean)));
      const cap = Math.min(7, x1.bandwidth() / 3);
      const eg = layer(svg, 'err').selectAll('g').data(rows, (d) => d.a + '|' + d.b).join((en) => { const g = en.append('g').style('opacity', intro ? 0 : 1); g.append('line').attr('class', 'v'); g.append('line').attr('class', 'c1'); g.append('line').attr('class', 'c2'); return g; })
        .style('stroke', 'var(--ink)').style('stroke-opacity', 0.55).attr('stroke-width', 1.2).style('pointer-events', 'none');
      if (intro) eg.transition().delay(750).duration(400).style('opacity', 1);
      const lo = (d) => y(Math.max(0, d.mean - d.sd)), hi = (d) => y(d.mean + d.sd);
      eg.select('.v').attr('x1', cx).attr('x2', cx).transition().duration(dur).ease(ease).attr('y1', hi).attr('y2', lo);
      eg.select('.c1').attr('x1', (d) => cx(d) - cap).attr('x2', (d) => cx(d) + cap).transition().duration(dur).ease(ease).attr('y1', hi).attr('y2', hi);
      eg.select('.c2').attr('x1', (d) => cx(d) - cap).attr('x2', (d) => cx(d) + cap).transition().duration(dur).ease(ease).attr('y1', lo).attr('y2', lo);
    });
    return { set(r, anim) { rows = r; api.draw(anim); } };
  }

  // line with SD band: rows ordered {t, mean, sd}
  function lineBand(node, opts = {}) {
    let rows = [], cur = -1, first = true, geo = null;
    const H = opts.height || 280;
    const api = mount(node, (W, anim) => {
      const { svg, fresh } = svgIn(node, W, H, opts.label || 'Line chart with standard deviation band');
      if (fresh) { ['grid', 'yl', 'xl', 'band', 'cursor', 'line', 'dots', 'hit'].forEach((c) => layer(svg, c)); }
      const y = d3.scaleLinear([0, d3.max(rows, (d) => d.mean + d.sd) || 1], [H - 26, 10]).nice();
      const ticks = y.ticks(5);
      const m = { l: Math.ceil(measure(svg, ticks.map(fmt))) + 14, r: 10 };
      const lv = rows.map((d) => d.t);
      const x = d3.scalePoint(lv, [m.l, W - m.r]).padding(0.35);
      const dur = anim && !fresh ? D(700) : 0;
      const intro = first && !reduce; first = false;
      layer(svg, 'grid').selectAll('line').data(ticks).join('line').attr('class', 'grid-l').attr('x1', m.l).attr('x2', W - m.r).transition().duration(dur).ease(ease).attr('y1', y).attr('y2', y);
      layer(svg, 'yl').selectAll('text').data(ticks).join('text').attr('text-anchor', 'end').attr('dy', '0.32em').text(fmt).transition().duration(dur).ease(ease).attr('x', m.l - 8).attr('y', y);
      const every = W < 480 ? 2 : 1;
      layer(svg, 'xl').selectAll('text').data(lv).join('text').attr('text-anchor', 'middle').attr('y', H - 6).attr('x', (d) => x(d)).text((d, i) => (i % every ? '' : d.slice(0, 3)));
      const area = d3.area().x((d) => x(d.t)).y0((d) => y(Math.max(0, d.mean - d.sd))).y1((d) => y(d.mean + d.sd));
      const line = d3.line().x((d) => x(d.t)).y((d) => y(d.mean));
      const band = layer(svg, 'band').selectAll('path').data([rows]).join('path').style('fill', 'var(--accent)').style('fill-opacity', 0.13);
      const path = layer(svg, 'line').selectAll('path').data([rows]).join('path').style('fill', 'none').style('stroke', 'var(--accent)').attr('stroke-width', 2.25).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round');
      if (dur) { band.transition().duration(dur).ease(ease).attr('d', area); path.transition().duration(dur).ease(ease).attr('d', line); }
      else { band.attr('d', area); path.attr('d', line); }
      if (intro) {
        path.attr('pathLength', 1).attr('stroke-dasharray', '1 1').attr('stroke-dashoffset', 1).transition().duration(1400).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0).on('end', function () { d3.select(this).attr('stroke-dasharray', null).attr('pathLength', null); });
        band.style('opacity', 0).transition().delay(500).duration(800).style('opacity', 1);
      }
      const dots = layer(svg, 'dots').selectAll('circle').data(rows, (d) => d.t).join('circle').attr('r', 3.5).style('fill', 'var(--surface)').style('stroke', 'var(--accent)').attr('stroke-width', 2).attr('cx', (d) => x(d.t));
      if (dur) dots.transition().duration(dur).ease(ease).attr('cy', (d) => y(d.mean)); else dots.attr('cy', (d) => y(d.mean));
      if (intro) dots.style('opacity', 0).transition().delay((d, i) => 110 * i).duration(250).style('opacity', 1);
      layer(svg, 'hit').selectAll('rect').data(rows, (d) => d.t).join('rect').attr('x', (d) => x(d.t) - x.step() / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 20).style('fill', 'transparent').style('cursor', opts.onPick ? 'pointer' : null)
        .on('mousemove', (ev, d) => tip.show(`${opts.name ? opts.name() + ' · ' : ''}${d.t}`, [{ text: `${fmt(d.mean)} ± ${fmt(d.sd)} mM` }], ev)).on('mouseleave', tip.hide)
        .on('click', (ev, d) => opts.onPick && opts.onPick(lv.indexOf(d.t)));
      geo = { x, y, H, lv };
      cursor(false);
    });
    function cursor(anim) {
      if (!geo || cur < 0) return;
      const svg = d3.select(node).select('svg');
      const t = geo.lv[cur];
      svg.select('g.cursor').selectAll('line').data([t]).join('line').style('stroke', 'var(--muted)').attr('stroke-dasharray', '3 3').attr('y1', 8).attr('y2', geo.H - 24)
        .transition().duration(anim ? D(500) : 0).ease(ease).attr('x1', geo.x(t)).attr('x2', geo.x(t));
      svg.select('g.dots').selectAll('circle').attr('r', (d) => (d.t === t ? 5.5 : 3.5)).style('fill', (d) => (d.t === t ? 'var(--accent)' : 'var(--surface)'));
    }
    return { set(r, anim) { rows = r; api.draw(anim); }, cursor(i, anim) { cur = i; cursor(anim); } };
  }

  // diverging horizontal bars keyed by label: items {label, v}
  function divBars(node, opts = {}) {
    let items = [], first = true, ext = 1;
    const api = mount(node, (W, anim) => {
      const rowH = opts.rowH || 26, n = items.length, H = n * rowH + 22;
      node.style.setProperty('--h', H + 'px');
      const { svg, fresh } = svgIn(node, W, H, opts.label || 'Diverging bar chart');
      const narrow = W < 420;
      const lw = narrow ? 0 : Math.min(measure(svg, opts.allLabels || items.map((d) => d.label)), 200);
      const vr = opts.valueLabels ? measure(svg, opts.valueSample || ['0.05×', '20×']) + 10 : 6;
      const x = d3.scaleLinear([-ext, ext], [lw + 12 + vr, W - vr]);
      const y = d3.scaleBand(items.map((d) => d.label), [2, H - 20]).padding(0.26);
      const intro = first && !reduce; first = false;
      const dur = intro ? 900 : anim && !fresh ? D(800) : 0;
      layer(svg, 'zero').selectAll('line').data([0]).join('line').attr('class', 'axis-l').attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', H - 18);
      layer(svg, 'sc').selectAll('text').data(typeof opts.scale === 'function' ? opts.scale(ext) : opts.scale || []).join('text').attr('y', H - 4).attr('x', (d) => x(d.v)).attr('text-anchor', (d) => (d.v < 0 ? 'start' : d.v > 0 ? 'end' : 'middle')).text((d) => d.l);
      const g = layer(svg, 'bars').selectAll('g.b').data(items, (d) => d.label).join(
        (en) => { const gg = en.append('g').attr('class', 'b').attr('transform', (d) => `translate(0,${y(d.label)})`).style('opacity', 0); gg.append('rect').attr('rx', 4).attr('x', x(0)).attr('width', 0); gg.append('text').attr('class', 'nm strong').attr('dy', '0.32em'); gg.append('text').attr('class', 'val mono').attr('dy', '0.32em'); return gg; },
        (up) => up, (ex) => ex.transition().duration(D(300)).style('opacity', 0).remove());
      g.on('mousemove', (ev, d) => tip.show(d.label, [{ text: opts.tipText ? opts.tipText(d) : String(d.v) }], ev)).on('mouseleave', tip.hide)
        .style('cursor', opts.onPick ? 'pointer' : null).on('click', (ev, d) => opts.onPick && opts.onPick(d));
      g.transition().duration(dur).ease(ease).style('opacity', 1).attr('transform', (d) => `translate(0,${y(d.label)})`);
      const bw = y.bandwidth();
      g.select('rect').attr('height', bw).style('fill', (d) => (opts.fill && opts.fill(d)) || (d.v >= 0 ? 'var(--pos)' : 'var(--neg)'))
        .transition().duration(dur).delay((d, i) => (intro ? 40 * i : 0)).ease(intro ? d3.easeCubicOut : ease)
        .attr('x', (d) => Math.min(x(0), x(d.v))).attr('width', (d) => Math.max(1, Math.abs(x(d.v) - x(0))));
      g.select('.nm').attr('y', bw / 2).attr('x', lw + 4).attr('text-anchor', 'end').text((d) => d.label).style('display', narrow ? 'none' : null);
      g.select('.val').attr('y', bw / 2).text((d) => (narrow ? d.label + ' ' : '') + (opts.valueLabels ? opts.valueLabels(d) : ''))
        .transition().duration(dur).ease(ease)
        .attr('x', (d) => (narrow ? (d.v >= 0 ? x(0) - 6 : x(0) + 6) : d.v >= 0 ? x(d.v) + 6 : x(d.v) - 6))
        .attr('text-anchor', (d) => (narrow ? (d.v >= 0 ? 'end' : 'start') : d.v >= 0 ? 'start' : 'end'));
    });
    return { set(it, e, anim) { items = it; ext = e; api.draw(anim); } };
  }

  // PCA scatter with optional paths and loadings
  function pcaPlot(node, pca, opts) {
    let showLoads = false, first = true, mark = -1, geo = null;
    const api = mount(node, (W) => {
      const H = Math.round(Math.min(420, Math.max(280, W * 0.72)));
      node.style.setProperty('--h', H + 'px');
      node.replaceChildren();
      const svg = d3.select(node).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'PCA score plot');
      const sc = pca.scores;
      const mx = d3.max(sc, (d) => Math.abs(d.pc1)) * 1.2, my = d3.max(sc, (d) => Math.abs(d.pc2)) * 1.28;
      const x = d3.scaleLinear([-mx, mx], [10, W - 10]), y = d3.scaleLinear([-my, my], [H - 22, 10]);
      svg.append('g').selectAll('line').data([0, 1]).join('line').attr('class', 'axis-l').attr('stroke-dasharray', '3 3')
        .attr('x1', (d) => (d ? x(0) : 10)).attr('x2', (d) => (d ? x(0) : W - 10)).attr('y1', (d) => (d ? 10 : y(0))).attr('y2', (d) => (d ? H - 22 : y(0)));
      svg.append('text').attr('x', W - 10).attr('y', y(0) - 6).attr('text-anchor', 'end').attr('class', 'mono').text(`PC1 · ${d3.format('.0%')(pca.var[0])}`);
      svg.append('text').attr('x', x(0) + 6).attr('y', 20).attr('class', 'mono').text(`PC2 · ${d3.format('.0%')(pca.var[1])}`);
      const top = pca.loadings.slice().sort((a, b) => Math.hypot(b.pc1, b.pc2) - Math.hypot(a.pc1, a.pc2)).slice(0, 6);
      const k = 0.8 * Math.min(mx / d3.max(top, (d) => Math.abs(d.pc1)), my / d3.max(top, (d) => Math.abs(d.pc2)));
      const lg = svg.append('g').attr('class', 'loads');
      const intro = first && !reduce; first = false;
      const line = d3.line().x((d) => x(d.pc1)).y((d) => y(d.pc2));
      const paths = opts.paths(sc);
      const p = svg.append('g').selectAll('path').data(paths).join('path').attr('d', (d) => line(d.pts)).style('fill', 'none').style('stroke', (d) => d.color)
        .attr('stroke-width', 2).attr('stroke-opacity', 0.55).attr('stroke-linejoin', 'round').attr('pathLength', 1).attr('stroke-dasharray', '1 1').attr('stroke-dashoffset', intro ? 1 : 0);
      if (intro) p.transition().delay((d, i) => 200 * i).duration(opts.drawMs || 1800).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0);
      const pts = svg.append('g').selectAll('circle').data(sc).join('circle').attr('cx', (d) => x(d.pc1)).attr('cy', (d) => y(d.pc2)).attr('r', (d) => (opts.rf ? opts.rf(d) : 5))
        .style('fill', opts.color).style('stroke', 'var(--surface)').attr('stroke-width', 1.5)
        .on('mousemove', (ev, d) => tip.show(opts.title(d), [{ color: opts.color(d), text: `PC1 ${d3.format('.2f')(d.pc1)} · PC2 ${d3.format('.2f')(d.pc2)}` }], ev)).on('mouseleave', tip.hide)
        .style('cursor', opts.onPick ? 'pointer' : null).on('click', (ev, d) => opts.onPick && opts.onPick(sc.indexOf(d)));
      if (intro) pts.style('opacity', 0).transition().delay(opts.delay).duration(300).style('opacity', 1);
      svg.append('g').selectAll('text').data(sc).join('text').attr('class', opts.lblClass || 'strong').attr('x', (d) => x(d.pc1) + 9).attr('y', (d) => y(d.pc2) - 6).text(opts.lbl);
      svg.append('g').attr('class', 'mark');
      geo = { x, y, svg, top, k, lg };
      loads(false); markIt(false);
    });
    function loads(anim) {
      if (!geo) return;
      const { x, y, top, k, lg } = geo;
      const g = lg.selectAll('g').data(showLoads ? top : [], (d) => d.m).join((en) => { const gg = en.append('g'); gg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(0)).attr('y2', y(0)).style('stroke', 'var(--muted)').attr('stroke-width', 1.25); gg.append('text').attr('x', x(0)).attr('y', y(0)).style('opacity', 0); return gg; }, (u) => u, (ex) => ex.remove());
      g.select('line').transition().duration(anim ? D(700) : 0).attr('x2', (d) => x(d.pc1 * k)).attr('y2', (d) => y(d.pc2 * k));
      g.select('text').text((d) => d.m).attr('dy', '0.32em').attr('text-anchor', (d) => (d.pc1 >= 0 ? 'start' : 'end'))
        .transition().duration(anim ? D(700) : 0).style('opacity', 1).attr('x', (d) => x(d.pc1 * k) + (d.pc1 >= 0 ? 4 : -4)).attr('y', (d) => y(d.pc2 * k));
    }
    function markIt(anim) {
      if (!geo || mark < 0) return;
      const d = pca.scores[mark];
      geo.svg.select('g.mark').selectAll('circle').data([d]).join('circle').attr('r', 11).style('fill', 'none').style('stroke', 'var(--ink)').attr('stroke-width', 1.5)
        .transition().duration(anim ? D(600) : 0).ease(ease).attr('cx', geo.x(d.pc1)).attr('cy', geo.y(d.pc2));
    }
    api.draw(false);
    return { loads(v) { showLoads = v; loads(true); }, replay() { first = true; api.draw(true); }, mark(i, anim) { mark = i; markIt(anim); } };
  }

  // ------------------------------------------------------------ home: NMR spectrum hero
  const PEAKS = [
    { m: 'Formate', p: [[8.45, 0.22]] },
    { m: 'Hippurate', p: [[7.83, 0.32], [7.64, 0.24], [7.55, 0.3]] },
    { m: 'Fumarate', p: [[6.52, 0.2]] },
    { m: 'Orotic acid', p: [[6.19, 0.55]] },
    { m: 'Urea', p: [[5.78, 0.3, 0.03]] },
    { m: 'Lactose', p: [[5.22, 0.62], [4.45, 0.7], [3.95, 0.5], [3.83, 0.62], [3.72, 0.78], [3.62, 0.55], [3.55, 0.48]] },
    { m: 'Choline', p: [[3.2, 0.72]] },
    { m: 'Creatine', p: [[3.03, 0.6], [3.93, 0.3]] },
    { m: 'Citrate', p: [[2.67, 0.62], [2.54, 0.66]] },
    { m: 'Acetone', p: [[2.23, 0.28]] },
    { m: 'Acetate', p: [[1.92, 0.42]] },
    { m: 'Lactate', p: [[1.33, 0.36]] },
    { m: '3-Hydroxybutyrate', p: [[1.2, 0.25]] },
    { m: 'Butyrate', p: [[0.89, 0.3]] },
  ];
  function spectrum(fig) {
    const node = el('div', 'chart');
    node.style.setProperty('--h', '300px');
    fig.prepend(node);
    let played = false;
    mount(node, (W) => {
      const H = Math.round(Math.max(240, Math.min(340, W * 0.55)));
      node.style.setProperty('--h', H + 'px');
      node.replaceChildren();
      const svg = d3.select(node).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Stylised milk 1H-NMR spectrum with labelled metabolite peaks');
      const x = d3.scaleLinear([9, 0.5], [6, W - 6]);
      const base = H - 26, top = 78;
      const y = d3.scaleLinear([0, 1], [base, top]);
      const lines = PEAKS.flatMap((g) => g.p.map(([c, h, w]) => ({ c, h, w: w || 0.008 })));
      const f = (v) => lines.reduce((s, l) => s + (l.h * l.w * l.w) / ((v - l.c) ** 2 + l.w * l.w), 0);
      const xs = d3.range(9, 0.5, -0.0025);
      const data = xs.map((v) => [v, Math.min(1.02, f(v))]);
      const ln = d3.line().x((d) => x(d[0])).y((d) => y(d[1])).curve(d3.curveLinear);
      const ar = d3.area().x((d) => x(d[0])).y0(base).y1((d) => y(d[1]));
      svg.append('path').attr('d', ar(data)).style('fill', 'var(--accent)').style('fill-opacity', 0.07);
      const path = svg.append('path').attr('d', ln(data)).style('fill', 'none').style('stroke', 'var(--accent)').attr('stroke-width', 1.4).attr('stroke-linejoin', 'round').attr('pathLength', 1).attr('stroke-dasharray', '1 1');
      const ax = svg.append('g').attr('class', 'axis');
      ax.append('line').attr('x1', 6).attr('x2', W - 6).attr('y1', base).attr('y2', base).attr('class', 'axis-l');
      ax.selectAll('text').data(d3.range(1, 9)).join('text').attr('x', (d) => x(d)).attr('y', base + 16).attr('text-anchor', 'middle').text((d) => d);
      ax.append('text').attr('x', W - 6).attr('y', base + 16).attr('text-anchor', 'end').text('ppm');
      // labels: place in tiers so they never overlap
      const lab = PEAKS.map((g) => { const tall = g.p.reduce((a, b) => (b[1] > a[1] ? b : a)); return { m: g.m, c: tall[0], h: Math.min(1.02, f(tall[0])) }; }).sort((a, b) => x(a.c) - x(b.c));
      const t = svg.append('text').attr('class', 'pk-lbl'); lab.forEach((d) => { t.text(d.m); d.w = t.node().getComputedTextLength(); }); t.remove();
      const tiers = [[], [], [], []];
      lab.forEach((d) => { const cx = Math.max(d.w / 2 + 2, Math.min(W - d.w / 2 - 2, x(d.c))); let k = 0; for (; k < tiers.length; k++) { if (tiers[k].every((o) => Math.abs(o.cx - cx) > (d.w + o.w) / 2 + 8)) break; } d.k = k; if (k < tiers.length) tiers[k].push({ cx, w: d.w }); });
      const g = svg.append('g').selectAll('a').data(lab.filter((d) => d.k < 4)).join('a').attr('class', 'pk').attr('href', (d) => (metBy.has(d.m) ? `${ROOT}metabolites/${slug(d.m)}.html` : null)).attr('aria-label', (d) => d.m);
      g.append('line').attr('x1', (d) => x(d.c)).attr('x2', (d) => x(d.c)).attr('y1', (d) => 14 + d.k * 16 + 4).attr('y2', (d) => y(d.h) - 4).style('stroke', 'var(--line)');
      g.append('text').attr('class', 'pk-lbl').attr('x', (d) => Math.max(d.w / 2 + 2, Math.min(W - d.w / 2 - 2, x(d.c)))).attr('y', (d) => 14 + d.k * 16).attr('text-anchor', 'middle').text((d) => d.m);
      g.on('mouseenter', (ev, d) => hl(d.m)).on('mouseleave', () => hl(null)).on('focus', (ev, d) => hl(d.m)).on('blur', () => hl(null));
      const hiG = svg.insert('g', ':first-child');
      function hl(m) {
        const grp = PEAKS.find((p) => p.m === m);
        hiG.selectAll('path').data(grp ? [grp] : []).join('path').style('fill', 'var(--s2)').style('fill-opacity', 0.35)
          .attr('d', (gp) => { const own = gp.p.map(([c, h, w]) => ({ c, h, w: w || 0.008 })); const fo = (v) => own.reduce((s, l) => s + (l.h * l.w * l.w) / ((v - l.c) ** 2 + l.w * l.w), 0); return ar(xs.map((v) => [v, Math.min(1.02, fo(v))])); });
      }
      if (!played && !reduce) {
        played = true;
        path.attr('stroke-dashoffset', 1).transition().duration(2600).ease(d3.easeCubicInOut).attr('stroke-dashoffset', 0);
        g.style('opacity', 0).transition().delay((d) => 300 + 2300 * ((x(d.c) - 6) / (W - 12))).duration(400).style('opacity', 1);
      } else path.attr('stroke-dashoffset', 0);
    }).draw(false);
  }

  // ------------------------------------------------------------ home: study previews
  function studyPreview(node, s) {
    mount(node, (W) => {
      const H = 120;
      node.replaceChildren();
      const svg = d3.select(node).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('preserveAspectRatio', 'none');
      if (s.kind === 'properties') {
        const ps = s.props.slice().sort((a, b) => d3.max(b.rows, (r) => Math.abs(Math.log2(r.rel))) - d3.max(a.rows, (r) => Math.abs(Math.log2(r.rel)))).slice(0, 5);
        const x = d3.scaleLinear([0, s.levels.length - 1], [4, W - 4]);
        const ext = d3.max(ps, (p) => d3.max(p.rows, (r) => Math.abs(Math.log2(r.rel))));
        const y = d3.scaleLinear([-ext, ext], [H - 6, 6]);
        const ln = d3.line().x((d) => x(d.i)).y((d) => y(Math.log2(d.rel)));
        svg.selectAll('path').data(ps.map((p) => p.rows)).join('path').attr('d', ln).style('fill', 'none').style('stroke', (d, i) => SCOL(i)).attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke')
          .attr('pathLength', 1).attr('class', 'draw').style('--i', (d, i) => i * 3);
      } else if (s.kind === 'timecourse') {
        const top = Object.entries(s.summary_by_met).sort((a, b) => b[1].swing - a[1].swing).slice(0, 6).map((d) => d[0]);
        const x = d3.scaleLinear([0, s.levels.length - 1], [4, W - 4]);
        const ext = d3.max(s.rows.filter((r) => top.includes(r.m)), (r) => Math.abs(r.l2m));
        const y = d3.scaleLinear([-ext, ext], [H - 6, 6]);
        const ln = d3.line().x((d) => x(d.i)).y((d) => y(d.l2m));
        svg.selectAll('path').data(top.map((m) => s.rows.filter((r) => r.m === m))).join('path').attr('d', ln).style('fill', 'none').style('stroke', (d, i) => SCOL(i)).attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke')
          .attr('pathLength', 1).attr('class', 'draw').style('--i', (d, i) => i * 3);
      } else {
        const lv = s.b_levels, a = s.a_levels;
        const x = d3.scaleLinear([-1, 1], [8, W - 8]);
        const sc = s.pca.scores;
        const mx = d3.max(sc, (d) => Math.abs(d.pc1)), my = d3.max(sc, (d) => Math.abs(d.pc2));
        const y = d3.scaleLinear([-my * 1.2, my * 1.2], [H - 6, 6]);
        const xx = (v) => x(v / (mx * 1.15));
        svg.selectAll('path').data(lv.map((b) => a.map((aa) => sc.find((d) => d.a === aa && d.b === b)))).join('path').attr('d', d3.line().x((d) => xx(d.pc1)).y((d) => y(d.pc2)))
          .style('fill', 'none').style('stroke', (d, i) => SCOL(i)).attr('stroke-width', 2).attr('vector-effect', 'non-scaling-stroke').attr('pathLength', 1).attr('class', 'draw').style('--i', (d, i) => i * 5);
        svg.selectAll('circle').data(sc).join('circle').attr('cx', (d) => xx(d.pc1)).attr('cy', (d) => y(d.pc2)).attr('r', 3.5).style('fill', (d) => SCOL(lv.indexOf(d.b)));
      }
    }).draw(false);
  }

  // ------------------------------------------------------------ cross-study scatter
  function crossChart(node, cross) {
    legend($('#cross-legend'), MB.classes.filter((c) => cross.pts.some((p) => metBy.get(p.m)?.cls === c)).map((c) => [c, KCOL(c)]));
    let first = true;
    const api = mount(node, (W) => {
      const H = Math.round(Math.min(460, Math.max(300, W * 0.55)));
      node.style.setProperty('--h', H + 'px');
      node.replaceChildren();
      const svg = d3.select(node).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Seasonal shift in both studies');
      const ext = Math.ceil(d3.max(cross.pts, (d) => Math.max(Math.abs(d.x), Math.abs(d.y))) * 2) / 2;
      const m = { l: 44, r: 10, t: 10, b: 36 };
      const x = d3.scaleLinear([-ext, ext], [m.l, W - m.r]), y = d3.scaleLinear([-ext, ext], [H - m.b, m.t]);
      const ticks = d3.range(-Math.floor(ext), Math.floor(ext) + 1);
      svg.append('g').selectAll('line').data(ticks).join('line').attr('class', (d) => (d ? 'grid-l' : 'axis-l')).attr('x1', x).attr('x2', x).attr('y1', m.t).attr('y2', H - m.b);
      svg.append('g').selectAll('line').data(ticks).join('line').attr('class', (d) => (d ? 'grid-l' : 'axis-l')).attr('y1', y).attr('y2', y).attr('x1', m.l).attr('x2', W - m.r);
      svg.append('line').attr('x1', x(-ext)).attr('y1', y(-ext)).attr('x2', x(ext)).attr('y2', y(ext)).style('stroke', 'var(--muted)').attr('stroke-dasharray', '4 4');
      svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x).attr('y', H - m.b + 15).attr('text-anchor', 'middle').text(fold);
      svg.append('g').selectAll('text').data(ticks).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fold);
      svg.append('text').attr('x', W - m.r).attr('y', H - 4).attr('text-anchor', 'end').text(cross.x_label + ' →');
      svg.append('text').attr('x', m.l + 6).attr('y', m.t + 12).text('↑ ' + cross.y_label);
      const intro = first && !reduce; first = false;
      const a = svg.append('g').selectAll('a').data(cross.pts).join('a').attr('href', (d) => `${ROOT}metabolites/${slug(d.m)}.html`).attr('aria-label', (d) => d.m);
      const c = a.append('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', intro ? 0 : 6).style('fill', (d) => KCOL(metBy.get(d.m)?.cls)).style('stroke', 'var(--surface)').attr('stroke-width', 1.5)
        .on('mousemove', (ev, d) => tip.show(d.m, [{ color: KCOL(metBy.get(d.m)?.cls), text: metBy.get(d.m)?.cls || '' }, { text: `${cross.x_label}: ${fold(d.x)}` }, { text: `${cross.y_label}: ${fold(d.y)}` }], ev)).on('mouseleave', tip.hide);
      if (intro) inView(node, () => c.transition().delay((d, i) => 30 * i).duration(500).ease(d3.easeBackOut).attr('r', 6));
      const lab = cross.pts.slice().sort((p, q) => Math.hypot(q.x, q.y) - Math.hypot(p.x, p.y)).slice(0, 7);
      const placed = [];
      svg.append('g').selectAll('text').data(lab).join('text').attr('class', 'strong').attr('x', (d) => x(d.x) + (d.x > 0 ? -9 : 9)).attr('text-anchor', (d) => (d.x > 0 ? 'end' : 'start'))
        .attr('y', (d) => { let yy = y(d.y) + 4; while (placed.some((p) => Math.abs(p - yy) < 14)) yy += 14; placed.push(yy); return yy; }).text((d) => d.m);
    });
    api.draw(false);
  }

  // ------------------------------------------------------------ explorer (cards)
  function explorer(root) {
    const full = root.dataset.explorer === 'full';
    const params = new URLSearchParams(location.search);
    const st = { q: params.get('q') || '', cls: 'All', sort: 'name', study: 'all' };
    const tools = el('div', 'ex-tools');
    const q = el('input'); q.type = 'search'; q.placeholder = 'Search by name or role'; q.setAttribute('aria-label', 'Search metabolites'); q.value = st.q; q.id = 'ex-q';
    const sort = el('select'); sort.setAttribute('aria-label', 'Sort cards'); sort.id = 'ex-sort';
    const fa = MB.studies.find((s) => s.kind === 'factorial'), tc = MB.studies.find((s) => s.kind === 'timecourse');
    options(sort, ['name', 'class', ...(tc ? ['swing'] : []), ...(fa ? ['diet'] : [])], ['Sort: name', 'Sort: class', ...(tc ? ['Sort: seasonal swing'] : []), ...(fa ? ['Sort: diet effect'] : [])]);
    const count = el('span', 'ex-count');
    tools.append(q, sort, count);
    const chips = el('div', 'chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter by class');
    ['All', ...MB.classes].forEach((c) => { const b = el('button', 'chip'); b.type = 'button'; b.dataset.c = c; const s = el('span', 'sw'); s.style.background = c === 'All' ? 'var(--muted)' : KCOL(c); s.style.borderRadius = '50%'; b.append(s, document.createTextNode(c)); chips.append(b); });
    const grid = el('div', 'cards');
    root.append(tools, chips, grid);
    let firstDraw = true;
    function draw() {
      chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === st.cls)));
      const qq = st.q.trim().toLowerCase();
      let list = MB.mets.filter((m) => (st.cls === 'All' || m.cls === st.cls) && (!qq || m.m.toLowerCase().includes(qq) || m.role.toLowerCase().includes(qq) || m.cls.toLowerCase().includes(qq)));
      const nm = (a, b) => a.m.localeCompare(b.m, undefined, { sensitivity: 'base' });
      if (st.sort === 'class') list.sort((a, b) => a.cls.localeCompare(b.cls) || nm(a, b));
      else if (st.sort === 'swing') list.sort((a, b) => (tc.summary_by_met[b.m]?.swing ?? -1) - (tc.summary_by_met[a.m]?.swing ?? -1) || nm(a, b));
      else if (st.sort === 'diet') { const p = new Map(fa.pvalues.map((r) => [r.m, r.p[fa.p_names.findIndex((n) => /diet/i.test(n) && !/×/.test(n))] ?? r.p[0]])); list.sort((a, b) => (p.get(a.m) ?? 2) - (p.get(b.m) ?? 2) || nm(a, b)); }
      else list.sort(nm);
      count.textContent = `${list.length} of ${MB.mets.length} metabolites`;
      grid.replaceChildren(...list.map((m, i) => card(m, i, firstDraw || true)));
      if (!list.length) grid.append(el('p', 'empty', 'No metabolites match this search.'));
      firstDraw = false;
    }
    q.addEventListener('input', () => { st.q = q.value; draw(); });
    sort.addEventListener('change', () => { st.sort = sort.value; draw(); });
    chips.addEventListener('click', (e) => { const b = e.target.closest('button[data-c]'); if (b) { st.cls = b.dataset.c; draw(); } });
    draw();
  }
  function card(m, i, anim) {
    const a = el('a', 'mcard' + (anim && !reduce ? ' rise' : ''));
    a.href = `${ROOT}metabolites/${slug(m.m)}.html`;
    a.style.setProperty('--i', Math.min(i, 20)); a.style.setProperty('--cc', KCOL(m.cls));
    const c = el('span', 'cls', m.cls);
    const h = el('h3', null, m.m);
    if (m.vip && m.vip.length) { const v = el('span', 'vipdot', 'VIP'); v.title = m.vip.join(' · ') + ' (VIP > 1)'; h.append(v); }
    a.append(h, c, el('p', null, m.role));
    const viz = el('div', 'viz');
    for (const s of MB.studies) {
      if (!m.studies.includes(s.id)) continue;
      const box = el('div');
      box.append(el('span', null, s.short));
      if (s.kind === 'properties') {
        const n = s.models.filter((md) => md.terms.some((t) => t.x === m.m && t.type === 'metabolite')).length;
        box.append(el('b', 'pred', `Candidate predictor · ${n} propert${n === 1 ? 'y' : 'ies'}`));
        viz.append(box);
        continue;
      }
      const svg = d3.select(box).append('svg').attr('viewBox', '0 0 120 40').attr('aria-hidden', 'true');
      if (s.kind === 'timecourse') {
        const rs = s.rows.filter((r) => r.m === m.m);
        const x = d3.scaleLinear([0, rs.length - 1], [2, 118]), y = d3.scaleLinear([0, d3.max(rs, (r) => r.mean)], [38, 3]);
        svg.append('path').attr('d', d3.area().x((d, j) => x(j)).y0(38).y1((d) => y(d.mean))(rs)).style('fill', 'var(--accent)').style('fill-opacity', 0.12);
        svg.append('path').attr('d', d3.line().x((d, j) => x(j)).y((d) => y(d.mean))(rs)).style('fill', 'none').style('stroke', 'var(--accent)').attr('stroke-width', 1.6).attr('pathLength', 1).attr('class', anim ? 'draw' : null).style('--i', Math.min(i, 20));
      } else {
        const rs = s.rows.filter((r) => r.m === m.m);
        const x0 = d3.scaleBand(s.a_levels, [1, 119]).paddingInner(0.22), x1 = d3.scaleBand(s.b_levels, [0, x0.bandwidth()]).padding(0.1);
        const y = d3.scaleLinear([0, d3.max(rs, (r) => r.mean)], [39, 3]);
        svg.selectAll('rect').data(rs).join('rect').attr('x', (d) => x0(d.a) + x1(d.b)).attr('width', x1.bandwidth()).attr('y', (d) => y(d.mean)).attr('height', (d) => 39 - y(d.mean)).attr('rx', 1).style('fill', (d) => SCOL(s.b_levels.indexOf(d.b)));
      }
      viz.append(box);
    }
    a.append(viz);
    return a;
  }

  // ------------------------------------------------------------ factorial study page
  function factorialPage(s) {
    const aL = s.a_levels, bL = s.b_levels;
    const iInter = s.p_names.findIndex((n) => /×|x/i.test(n) && /season|diet/i.test(n));
    const st = { met: null, tour: null, contrast: s.contrasts[0], focus: 'all' };
    const spread = d3.rollup(s.rows, (rs) => d3.max(rs, (r) => r.mean) / Math.max(1e-9, d3.min(rs, (r) => r.mean)), (r) => r.m);
    st.met = s.featured && s.metabolites.includes(s.featured) ? s.featured : d3.greatest(s.metabolites.filter((m) => d3.min(s.rows.filter((r) => r.m === m), (r) => r.mean) >= 0.005), (m) => spread.get(m));
    const sel = $('#bar-met'); options(sel, s.metabolites); sel.value = st.met;
    legend($('#bar-legend'), bL.map((b, i) => [`${b} · ${s.level_names?.[b] || b}`, SCOL(i)]));
    const bars = groupedBars($('#bar-chart'), aL, bL, { height: 320, name: () => st.met, label: 'Mean concentration by diet and season' });
    function chips() {
      const pv = s.pvalues.find((p) => p.m === st.met);
      $('#bar-chips').replaceChildren(...s.p_names.map((n, k) => el('span', 'chip' + (pv.p[k] < 0.05 ? ' sig' : ''), `${n} p ${pv.pl[k].startsWith('<') ? pv.pl[k] : '= ' + pv.pl[k]}`)),
        Object.assign(el('a', 'chip link', `Open ${st.met}'s MetaBó-Card →`), { href: `../metabolites/${slug(st.met)}.html` }));
    }
    function showMet(anim) { sel.value = st.met; bars.set(s.rows.filter((r) => r.m === st.met), anim); chips(); }
    showMet(false);
    sel.addEventListener('change', () => { stopTour(); st.met = sel.value; showMet(true); });
    const tourBtn = $('#bar-tour');
    function stopTour() { if (st.tour) clearInterval(st.tour); st.tour = null; tourBtn.textContent = '▶ Tour interactions'; tourBtn.setAttribute('aria-pressed', 'false'); }
    tourBtn.addEventListener('click', () => {
      if (st.tour) { stopTour(); return; }
      const list = s.pvalues.filter((p) => p.p[iInter >= 0 ? iInter : s.p_names.length - 1] < 0.05).map((p) => p.m);
      if (!list.length) return;
      let i = Math.max(0, list.indexOf(st.met) + 1);
      const step = () => { st.met = list[i % list.length]; i++; showMet(true); };
      tourBtn.textContent = '❚❚ Stop tour'; tourBtn.setAttribute('aria-pressed', 'true');
      step(); st.tour = setInterval(step, 2300);
    });

    // PCA
    legend($('#pca-legend'), bL.map((b, i) => [b, SCOL(i)]));
    const pc = pcaPlot($('#pca-chart'), s.pca, {
      paths: (sc) => bL.map((b, i) => ({ color: SCOL(i), pts: aL.map((a) => sc.find((d) => d.a === a && d.b === b)) })),
      color: (d) => SCOL(bL.indexOf(d.b)), title: (d) => `${d.a} · ${d.b}`, lbl: (d) => d.a.slice(0, 2), lblClass: '',
      delay: (d) => 200 * bL.indexOf(d.b) + 650 * aL.indexOf(d.a), drawMs: 1600, rf: (d) => 4 + 1.6 * aL.indexOf(d.a),
    });
    const lb = $('#pca-load'); lb.addEventListener('click', () => { const v = lb.getAttribute('aria-pressed') !== 'true'; lb.setAttribute('aria-pressed', String(v)); pc.loads(v); });
    $('#pca-replay').addEventListener('click', () => pc.replay());

    // drivers
    const drv = divBars($('#drv-chart'), { label: 'Top loadings', tipText: (d) => `Loading ${d3.format('.3f')(d.v)}`, allLabels: s.metabolites, onPick: (d) => { stopTour(); st.met = d.label; showMet(true); $('#explore-bars').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); },
      scale: (e) => [{ v: -e, l: '← negative' }, { v: e, l: 'positive →' }] });
    function drvDraw(anim) {
      const k = $('#drv-pc').value;
      const top = s.pca.loadings.slice().sort((a, b) => Math.abs(b[k]) - Math.abs(a[k])).slice(0, 12).sort((a, b) => b[k] - a[k]).map((d) => ({ label: d.m, v: d[k] }));
      drv.set(top, d3.max(top, (d) => Math.abs(d.v)) * 1.05, anim);
    }
    $('#drv-pc').addEventListener('change', () => drvDraw(true));
    inView($('#drv-chart'), () => drvDraw(false));

    // dietary shift dumbbell
    const csel = $('#sh-c'); options(csel, s.contrasts); csel.value = st.contrast;
    const fp = $('#sh-focus');
    fp.replaceChildren(...['all', ...aL].map((a) => { const b = el('button', 'chip', a === 'all' ? 'Average' : a); b.type = 'button'; b.dataset.f = a; return b; }));
    legend($('#sh-legend'), aL.map((a, i) => [a, TCOL(i)]));
    const node = $('#sh-chart');
    let shFirst = true;
    const sh = mount(node, (W, anim) => {
      fp.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.f === st.focus)));
      const rows = s.shift.filter((r) => r.c === st.contrast);
      const by = [...d3.group(rows, (r) => r.m)].map(([m, rs]) => ({ m, rs, mean: d3.mean(rs, (r) => r.v), lo: d3.min(rs, (r) => r.v), hi: d3.max(rs, (r) => r.v) }));
      const key = (d) => (st.focus === 'all' ? d.mean : d.rs.find((r) => r.a === st.focus).v);
      by.sort((a, b) => key(b) - key(a));
      const ext = Math.max(1, Math.ceil(d3.max(s.shift, (r) => Math.abs(r.v))));
      const rowH = 17, top = 24, H = top + by.length * rowH + 6;
      node.style.setProperty('--h', H + 'px');
      const { svg, fresh } = svgIn(node, W, H, 'Dietary shift by metabolite and season');
      const lw = Math.min(measure(svg, s.metabolites), W < 480 ? 110 : 210);
      const x = d3.scaleLinear([-ext, ext], [lw + 14, W - 10]);
      const ticks = d3.range(-ext, ext + 1);
      const ax = layer(svg, 'ax').selectAll('g').data(ticks).join((en) => { const g = en.append('g'); g.append('line'); g.append('text'); return g; });
      ax.select('line').attr('class', (d) => (d ? 'grid-l' : 'axis-l')).attr('x1', x).attr('x2', x).attr('y1', top - 6).attr('y2', H);
      ax.select('text').attr('x', x).attr('y', 12).attr('text-anchor', 'middle').attr('class', 'mono').text((d) => (d ? fold(d) : 'equal'));
      const intro = shFirst && !reduce; shFirst = false;
      const dur = anim && !fresh ? D(750) : 0;
      const g = layer(svg, 'rows').selectAll('g.r').data(by, (d) => d.m).join((en) => {
        const gg = en.append('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${top + i * rowH})`);
        gg.append('rect').attr('class', 'hit').attr('x', 0).attr('height', rowH).style('fill', 'transparent');
        gg.append('a').attr('href', (d) => `../metabolites/${slug(d.m)}.html`).append('text').attr('class', 'strong').attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end');
        gg.append('line').attr('class', 'rng').attr('y1', rowH / 2).attr('y2', rowH / 2).style('stroke', 'var(--line)').attr('stroke-width', 3).attr('stroke-linecap', 'round');
        return gg;
      });
      g.on('mousemove', (ev, d) => tip.show(`${d.m} · ${st.contrast}`, d.rs.map((r) => ({ color: TCOL(aL.indexOf(r.a)), text: `${r.a}: ${fold(r.v)}` })), ev)).on('mouseleave', tip.hide);
      g.transition().duration(dur).ease(ease).attr('transform', (d, i) => `translate(0,${top + i * rowH})`);
      g.select('.hit').attr('width', W);
      g.select('text').attr('x', lw + 4).text((d) => (W < 480 && d.m.length > 16 ? d.m.slice(0, 14) + '…' : d.m));
      g.select('.rng').transition().duration(intro ? D(900) : dur).attr('x1', (d) => x(d.lo)).attr('x2', (d) => x(d.hi));
      g.selectAll('circle').data((d) => d.rs, (r) => r.a).join((en) => en.append('circle').attr('cx', x(0)).attr('cy', rowH / 2).attr('r', 4))
        .style('fill', (r) => TCOL(aL.indexOf(r.a))).style('stroke', 'var(--surface)').attr('stroke-width', 1)
        .transition().duration(intro ? D(1000) : dur).delay((r, i) => (intro ? 150 * i : 0)).ease(d3.easeCubicOut)
        .attr('cx', (r) => x(r.v)).attr('r', (r) => (st.focus === 'all' || r.a === st.focus ? 4.5 : 3)).style('opacity', (r) => (st.focus === 'all' || r.a === st.focus ? 1 : 0.25));
    });
    inView(node, () => sh.draw(false));
    csel.addEventListener('change', () => { st.contrast = csel.value; sh.draw(true); });
    fp.addEventListener('click', (e) => { const b = e.target.closest('button[data-f]'); if (b) { st.focus = b.dataset.f; sh.draw(true); } });

    // p-value table
    const t = $('#pv-table');
    const ts = { k: -1, dir: 1, q: '' };
    function tbl() {
      const head = el('thead'), hr = el('tr');
      ['Metabolite', ...s.p_names].forEach((n, i) => { const th = el('th'); const b = el('button', null, i ? `${n} p` : n); b.type = 'button'; b.addEventListener('click', () => { ts.dir = ts.k === i - 1 ? -ts.dir : 1; ts.k = i - 1; tbl(); }); th.append(b); if (ts.k === i - 1) th.setAttribute('aria-sort', ts.dir > 0 ? 'ascending' : 'descending'); hr.append(th); });
      head.append(hr);
      const qq = ts.q.toLowerCase();
      const rows = s.pvalues.filter((p) => !qq || p.m.toLowerCase().includes(qq)).sort((a, b) => (ts.k < 0 ? a.m.localeCompare(b.m) : a.p[ts.k] - b.p[ts.k] || a.m.localeCompare(b.m)) * ts.dir);
      const tb = el('tbody');
      rows.forEach((p) => { const tr = el('tr'); const td = el('td'); const a = el('a', null, p.m); a.href = `../metabolites/${slug(p.m)}.html`; td.append(a); tr.append(td); p.pl.forEach((l, k) => tr.append(el('td', p.p[k] < 0.05 ? 'sig' : 'ns', l))); tb.append(tr); });
      t.replaceChildren(head, tb);
    }
    $('#pv-q').addEventListener('input', (e) => { ts.q = e.target.value; tbl(); });
    tbl();
  }

  // ------------------------------------------------------------ time-course study page
  function timecoursePage(s) {
    const L = s.levels;
    const st = { met: null, i: L.length - 1, play: null, clock: null };
    const tops = Object.entries(s.summary_by_met).sort((a, b) => b[1].swing - a[1].swing).map((d) => d[0]);
    st.met = tops[0];
    st.clock = tops.slice(0, 3);
    const sel = $('#line-met'); options(sel, s.metabolites); sel.value = st.met;
    const rowsOf = (m) => s.rows.filter((r) => r.m === m);
    const line = lineBand($('#line-chart'), { height: 280, name: () => st.met, onPick: (i) => { stop(); setI(i); } });
    function showLine(anim) {
      sel.value = st.met; line.set(rowsOf(st.met), anim); line.cursor(st.i, anim);
      const r = rowsOf(st.met)[st.i];
      const ro = $('#readout'); ro.replaceChildren(document.createTextNode(`${st.met}, ${r.t}: `), el('b', null, `${fmt(r.mean)} ± ${fmt(r.sd)} mM`), document.createTextNode(' · '), Object.assign(el('a', null, 'MetaBó-Card →'), { href: `../metabolites/${slug(st.met)}.html` }));
    }
    sel.addEventListener('change', () => { st.met = sel.value; showLine(true); });
    // race
    const top12 = tops.slice(0, 12);
    const ext = d3.max(s.rows.filter((r) => top12.includes(r.m)), (r) => Math.abs(r.l2f));
    const race = divBars($('#race-chart'), { label: 'Fold change against the first month', allLabels: top12, valueLabels: (d) => fold(d.v), tipText: (d) => `${fold(d.v)} its ${L[0]} level in ${L[st.i]}`,
      scale: [{ v: -ext, l: fold(-ext) }, { v: 0, l: `${L[0].slice(0, 3)} level` }, { v: ext, l: fold(ext) }], onPick: (d) => { st.met = d.label; showLine(true); } });
    function drawRace(anim) { race.set(top12.map((m) => ({ label: m, v: s.rows.find((r) => r.m === m && r.i === st.i).l2f })).sort((a, b) => b.v - a.v || a.label.localeCompare(b.label)), ext, anim); }
    // clock
    const cnode = $('#clock-chart'), chipsN = $('#clock-chips');
    const top8 = tops.slice(0, 8);
    chipsN.replaceChildren(...top8.map((m) => { const b = el('button', 'chip'); b.type = 'button'; b.dataset.m = m; const sw = el('span', 'sw'); sw.style.borderRadius = '50%'; b.append(sw, document.createTextNode(m)); return b; }));
    let clockGeo = null, clockFirst = true, handAng = null;
    const cext = Math.max(1, Math.ceil(d3.max(s.rows.filter((r) => top8.includes(r.m)), (r) => Math.abs(r.l2m)) * 2) / 2);
    const nT = L.length, slots = nT <= 12 ? 12 : nT;
    const ang = (i) => ((i + (12 - nT >= 2 ? 1 : 0)) * 2 * Math.PI) / slots;
    const clock = mount(cnode, (W0, anim) => {
      chipsN.querySelectorAll('button').forEach((b) => { const k = st.clock.indexOf(b.dataset.m); b.setAttribute('aria-pressed', String(k >= 0)); b.querySelector('.sw').style.background = k >= 0 ? SCOL(k) : 'transparent'; b.querySelector('.sw').style.border = '1px solid var(--muted)'; });
      const W = Math.min(W0, 520), cx = W / 2, cy = W / 2, R = W / 2 - 32, r0 = R * 0.22;
      cnode.style.setProperty('--h', W + 'px');
      const rad = d3.scaleLinear([-cext, cext], [r0, R]);
      const pt = (i, v) => [cx + rad(v) * Math.sin(ang(i)), cy - rad(v) * Math.cos(ang(i))];
      const { svg, fresh } = svgIn(cnode, W, W, 'Seasonal clock');
      if (fresh) {
        svg.style('max-width', W + 'px').style('margin-inline', 'auto');
        const lv = d3.range(-Math.floor(cext), Math.floor(cext) + 1);
        svg.append('g').selectAll('circle').data(lv).join('circle').attr('cx', cx).attr('cy', cy).attr('r', rad).style('fill', 'none').attr('class', (d) => (d ? 'grid-l' : 'axis-l')).attr('stroke-dasharray', (d) => (d ? null : '3 3'));
        svg.append('g').selectAll('text').data(lv).join('text').attr('class', 'mono').attr('x', cx + 4).attr('y', (d) => cy - rad(d) - 3).text((d) => (d ? fold(d) : 'average'));
        svg.append('g').selectAll('line').data(L).join('line').attr('class', 'grid-l').attr('x1', (d, i) => pt(i, -cext)[0]).attr('y1', (d, i) => pt(i, -cext)[1]).attr('x2', (d, i) => pt(i, cext)[0]).attr('y2', (d, i) => pt(i, cext)[1]);
        svg.append('g').selectAll('text').data(L).join('text').attr('text-anchor', 'middle').attr('dy', '0.32em').attr('x', (d, i) => cx + (R + 17) * Math.sin(ang(i))).attr('y', (d, i) => cy - (R + 17) * Math.cos(ang(i))).text((d) => d.slice(0, 3));
        svg.append('line').attr('class', 'hand').attr('x1', cx).attr('y1', cy).style('stroke', 'var(--ink)').attr('stroke-width', 1.5).attr('stroke-linecap', 'round');
        svg.append('g').attr('class', 'series'); svg.append('g').attr('class', 'now');
        svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 3).style('fill', 'var(--ink)');
        handAng = null;
      }
      clockGeo = { pt, cx, cy, R, svg };
      const ser = st.clock.map((m) => rowsOf(m));
      const ln = d3.line().x((d) => pt(d.i, d.l2m)[0]).y((d) => pt(d.i, d.l2m)[1]);
      const intro = clockFirst && !reduce; clockFirst = false;
      svg.select('g.series').selectAll('path').data(ser, (d) => d[0].m).join(
        (en) => en.append('path').attr('pathLength', 1).attr('stroke-dasharray', '1 1').attr('stroke-dashoffset', reduce ? 0 : 1).call((p) => p.transition().delay((d, i) => (intro ? 250 * i : 0)).duration(D(1100)).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0)),
        (u) => u, (ex) => ex.transition().duration(D(250)).style('opacity', 0).remove())
        .attr('d', ln).style('fill', 'none').style('stroke', (d, i) => SCOL(i)).attr('stroke-width', 2.25).attr('stroke-linejoin', 'round');
      hand(anim);
    });
    function hand(anim) {
      if (!clockGeo) return;
      const { pt, cx, cy, R, svg } = clockGeo;
      const from = handAng ?? ang(st.i), to = ang(st.i); handAng = to;
      svg.select('.hand').transition().duration(anim ? D(700) : 0).ease(ease).attrTween('x2', () => (t) => cx + R * Math.sin(from + (to - from) * t)).attrTween('y2', () => (t) => cy - R * Math.cos(from + (to - from) * t));
      const now = st.clock.map((m, k) => ({ k, r: s.rows.find((r) => r.m === m && r.i === st.i) }));
      svg.select('g.now').selectAll('circle').data(now, (d) => d.r.m).join('circle').attr('r', 5).style('fill', (d) => SCOL(d.k)).style('stroke', 'var(--surface)').attr('stroke-width', 2)
        .on('mousemove', (ev, d) => tip.show(`${d.r.m} · ${d.r.t}`, [{ color: SCOL(d.k), text: `${fold(d.r.l2m)} its average` }], ev)).on('mouseleave', tip.hide)
        .transition().duration(anim ? D(700) : 0).ease(ease).attr('cx', (d) => pt(d.r.i, d.r.l2m)[0]).attr('cy', (d) => pt(d.r.i, d.r.l2m)[1]);
    }
    chipsN.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; const m = b.dataset.m; if (st.clock.includes(m)) { if (st.clock.length > 1) st.clock = st.clock.filter((x) => x !== m); } else st.clock = [...st.clock, m].slice(-4); clock.draw(true); });
    // PCA
    const n = L.length;
    const pc = pcaPlot($('#pca-chart'), s.pca, {
      paths: (sc) => [{ color: 'var(--accent)', pts: sc }], color: (d) => `color-mix(in srgb, var(--accent) ${Math.round(30 + (70 * s.pca.scores.indexOf(d)) / (n - 1))}%, var(--surface))`,
      title: (d) => d.label, lbl: (d) => d.label.slice(0, 3), delay: (d) => (2000 * s.pca.scores.indexOf(d)) / (n - 1), drawMs: 2000, onPick: (i) => { stop(); setI(i); },
    });
    const lb = $('#pca-load'); lb.addEventListener('click', () => { const v = lb.getAttribute('aria-pressed') !== 'true'; lb.setAttribute('aria-pressed', String(v)); pc.loads(v); });
    $('#pca-replay').addEventListener('click', () => { pc.replay(); pc.mark(st.i, false); });
    // heatmap
    const hnode = $('#heat-chart');
    let heatFirst = true, heatX = null;
    const heat = mount(hnode, (W) => {
      const byM = d3.group(s.rows, (r) => r.m);
      const peak = new Map([...byM].map(([m, rs]) => [m, d3.greatest(rs, (r) => r.l2m).i]));
      const mets = [...byM.keys()].sort((a, b) => peak.get(a) - peak.get(b) || a.localeCompare(b));
      const ch = 16, top = 20, H = top + mets.length * ch + 4;
      hnode.style.setProperty('--h', H + 'px');
      hnode.replaceChildren();
      const svg = d3.select(hnode).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Heatmap of each metabolite against its own average by month');
      const narrow = W < 480;
      const lw = Math.min(measure(svg, mets), narrow ? 110 : 220);
      const x = d3.scaleBand(d3.range(n), [lw + 10, W]).paddingInner(0.08);
      heatX = x;
      svg.append('g').selectAll('text').data(L).join('text').attr('x', (d, i) => x(i) + x.bandwidth() / 2).attr('y', 12).attr('text-anchor', 'middle').text((d) => (narrow ? d[0] : d.slice(0, 3)));
      const col = (v) => { const c = Math.max(-1, Math.min(1, v)); return `color-mix(in srgb, ${c >= 0 ? 'var(--pos)' : 'var(--neg)'} ${Math.round(Math.abs(c) * 100)}%, var(--surface))`; };
      const intro = heatFirst && !reduce; heatFirst = false;
      const rowsG = svg.append('g').selectAll('g').data(mets).join('g').attr('transform', (d, i) => `translate(0,${top + i * ch})`).style('cursor', 'pointer')
        .on('click', (ev, m) => { st.met = m; showLine(true); $('#line-chart').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); });
      rowsG.append('text').attr('x', lw).attr('y', ch / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((m) => (narrow && m.length > 15 ? m.slice(0, 13) + '…' : m));
      rowsG.selectAll('rect').data((m) => byM.get(m)).join('rect').attr('x', (d) => x(d.i)).attr('y', 1).attr('width', x.bandwidth()).attr('height', ch - 2).attr('rx', 2)
        .style('fill', (d) => col(d.l2m)).attr('class', intro ? 'hm-in' : null).style('--i', (d) => d.i)
        .on('mousemove', (ev, d) => tip.show(`${d.m} · ${d.t}`, [{ text: `${fmt(d.mean)} ± ${fmt(d.sd)} mM` }, { text: `${fold(d.l2m)} its average` }], ev)).on('mouseleave', tip.hide);
      svg.append('rect').attr('class', 'colsel').attr('y', top - 2).attr('height', mets.length * ch + 4).attr('rx', 3).style('fill', 'none').style('stroke', 'var(--ink)').attr('stroke-width', 1.5).style('pointer-events', 'none')
        .attr('x', x(st.i) - 2).attr('width', x.bandwidth() + 4);
    });
    function heatCol(anim) { if (!heatX) return; d3.select(hnode).select('.colsel').transition().duration(anim ? D(450) : 0).ease(ease).attr('x', heatX(st.i) - 2); }
    // month control
    const slider = $('#month'), mlabel = $('#month-label'), playBtn = $('#play');
    function setI(i, anim = true) {
      st.i = i; slider.value = String(i + 1); mlabel.textContent = L[i];
      showLine(anim); drawRace(anim); hand(anim); pc.mark(i, anim); heatCol(anim);
    }
    function stop() { if (st.play) clearInterval(st.play); st.play = null; playBtn.textContent = '▶ Play the year'; playBtn.setAttribute('aria-pressed', 'false'); }
    playBtn.addEventListener('click', () => {
      if (st.play) { stop(); return; }
      if (st.i >= n - 1) setI(0);
      playBtn.textContent = '❚❚ Pause'; playBtn.setAttribute('aria-pressed', 'true');
      st.play = setInterval(() => { if (st.i >= n - 1) { stop(); return; } setI(st.i + 1); }, 1200);
    });
    slider.addEventListener('input', () => { stop(); setI(+slider.value - 1); });
    setI(n - 1, false);
    inView(cnode, () => clock.draw(false));
    inView(hnode, () => heat.draw(false));
    // season table
    const ss = $('#ss-table');
    if (ss && s.season_rows) {
      const seasons = s.seasons;
      const ts = { q: '' };
      const by = d3.group(s.season_rows, (r) => r.m);
      const isSummary = (x) => /mean|overall|total/i.test(x);
      function tbl() {
        const head = el('thead'), hr = el('tr'); ['Metabolite', ...seasons].forEach((n) => hr.append(el('th', null, n))); head.append(hr);
        const tb = el('tbody');
        [...by.keys()].filter((m) => !ts.q || m.toLowerCase().includes(ts.q.toLowerCase())).sort((a, b) => a.localeCompare(b)).forEach((m) => {
          const rs = by.get(m); const core = rs.filter((r) => !isSummary(r.season));
          const lo = d3.min(core, (r) => r.mean), hi = d3.max(core, (r) => r.mean);
          const tr = el('tr'); const td = el('td'); const a = el('a', null, m); a.href = `../metabolites/${slug(m)}.html`; td.append(a); tr.append(td);
          seasons.forEach((sn) => { const r = rs.find((x) => x.season === sn); const c = el('td'); c.append(document.createTextNode(fmt(r.mean) + ' '), el('span', 'sd', '± ' + fmt(r.sd)));
            if (!isSummary(sn) && hi > lo) c.style.background = `color-mix(in srgb, var(--accent) ${Math.round(4 + 30 * ((r.mean - lo) / (hi - lo)))}%, transparent)`;
            tr.append(c); });
          tb.append(tr);
        });
        ss.replaceChildren(head, tb);
      }
      $('#ss-q').addEventListener('input', (e) => { ts.q = e.target.value; tbl(); });
      tbl();
    }
  }

  // ------------------------------------------------------------ properties study page
  // monthly mean ± SD line with the significance letters above each month
  function propChart(node, opts = {}) {
    let p = null, first = true;
    const H = opts.height || 300;
    const api = mount(node, (W, anim) => {
      const { svg, fresh } = svgIn(node, W, H, 'Monthly mean with standard deviation band and significance letters');
      if (fresh) ['grid', 'yl', 'xl', 'band', 'line', 'dots', 'let', 'hit'].forEach((c) => layer(svg, c));
      const rows = p.rows;
      const lo = d3.min(rows, (d) => d.mean - d.sd), hi = d3.max(rows, (d) => d.mean + d.sd);
      const y = d3.scaleLinear([lo - (hi - lo) * 0.05, hi + (hi - lo) * 0.05], [H - 26, 30]).nice();
      const ticks = y.ticks(5);
      const tf = y.tickFormat(5);
      const m = { l: Math.ceil(measure(svg, ticks.map(tf))) + 14, r: 10 };
      const x = d3.scalePoint(rows.map((d) => d.t), [m.l, W - m.r]).padding(0.35);
      const dur = anim && !fresh ? D(700) : 0;
      const intro = first && !reduce; first = false;
      layer(svg, 'grid').selectAll('line').data(ticks).join('line').attr('class', 'grid-l').attr('x1', m.l).attr('x2', W - m.r).transition().duration(dur).ease(ease).attr('y1', y).attr('y2', y);
      layer(svg, 'yl').selectAll('text').data(ticks).join('text').attr('text-anchor', 'end').attr('dy', '0.32em').text(tf).transition().duration(dur).ease(ease).attr('x', m.l - 8).attr('y', y);
      const every = W < 480 ? 2 : 1;
      layer(svg, 'xl').selectAll('text').data(rows).join('text').attr('text-anchor', 'middle').attr('y', H - 6).attr('x', (d) => x(d.t)).text((d, i) => (i % every ? '' : d.t.slice(0, 3)));
      const area = d3.area().x((d) => x(d.t)).y0((d) => y(d.mean - d.sd)).y1((d) => y(d.mean + d.sd));
      const line = d3.line().x((d) => x(d.t)).y((d) => y(d.mean));
      const band = layer(svg, 'band').selectAll('path').data([rows]).join('path').style('fill', 'var(--accent)').style('fill-opacity', 0.13);
      const path = layer(svg, 'line').selectAll('path').data([rows]).join('path').style('fill', 'none').style('stroke', 'var(--accent)').attr('stroke-width', 2.25).attr('stroke-linejoin', 'round');
      if (dur) { band.transition().duration(dur).ease(ease).attr('d', area); path.transition().duration(dur).ease(ease).attr('d', line); } else { band.attr('d', area); path.attr('d', line); }
      if (intro) { path.attr('pathLength', 1).attr('stroke-dasharray', '1 1').attr('stroke-dashoffset', 1).transition().duration(1300).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0).on('end', function () { d3.select(this).attr('stroke-dasharray', null).attr('pathLength', null); }); }
      const dots = layer(svg, 'dots').selectAll('circle').data(rows, (d) => d.t).join('circle').attr('r', 3.5).style('fill', 'var(--surface)').style('stroke', 'var(--accent)').attr('stroke-width', 2).attr('cx', (d) => x(d.t));
      const lets = layer(svg, 'let').selectAll('text').data(rows, (d) => d.t).join('text').attr('class', 'mono letters').attr('text-anchor', 'middle').attr('x', (d) => x(d.t)).text((d) => d.g);
      if (dur) { dots.transition().duration(dur).ease(ease).attr('cy', (d) => y(d.mean)); lets.transition().duration(dur).ease(ease).attr('y', (d) => y(d.mean + d.sd) - 8); }
      else { dots.attr('cy', (d) => y(d.mean)); lets.attr('y', (d) => y(d.mean + d.sd) - 8); }
      if (intro) { dots.style('opacity', 0).transition().delay((d, i) => 110 * i).duration(250).style('opacity', 1); lets.style('opacity', 0).transition().delay((d, i) => 400 + 110 * i).duration(300).style('opacity', 1); }
      layer(svg, 'hit').selectAll('rect').data(rows, (d) => d.t).join('rect').attr('x', (d) => x(d.t) - x.step() / 2).attr('width', x.step()).attr('y', 0).attr('height', H - 20).style('fill', 'transparent')
        .on('mousemove', (ev, d) => tip.show(`${p.label} · ${d.t}`, [{ text: `${d.ms} ± ${d.ss}${p.unit ? ' ' + p.unit : ''}` }, { text: d.g ? `Group ${d.g.split('').join(', ')}` : '' }], ev)).on('mouseleave', tip.hide);
    });
    return { set(prop, anim) { p = prop; api.draw(anim); } };
  }

  // two series relative to their own average: [{label, color, pts:[{t, rel}]}]
  function relLines(node, opts = {}) {
    let series = [], levels = [];
    const H = opts.height || 240;
    const api = mount(node, (W, anim) => {
      const { svg, fresh } = svgIn(node, W, H, 'Two series relative to their own average');
      if (fresh) ['grid', 'yl', 'xl', 'lines', 'dots'].forEach((c) => layer(svg, c));
      const all = series.flatMap((s) => s.pts.map((d) => d.rel));
      const ext = Math.max(0.05, d3.max(all, (v) => Math.abs(v - 1)));
      const y = d3.scaleLinear([1 - ext * 1.1, 1 + ext * 1.1], [H - 26, 10]).nice();
      const ticks = y.ticks(5), tf = (v) => (Math.abs(v - 1) < 1e-9 ? 'average' : d3.format('+.0%')(v - 1));
      const m = { l: Math.ceil(measure(svg, ticks.map(tf))) + 14, r: 10 };
      const x = d3.scalePoint(levels, [m.l, W - m.r]).padding(0.35);
      const dur = anim && !fresh ? D(650) : 0;
      layer(svg, 'grid').selectAll('line').data(ticks).join('line').attr('class', (d) => (Math.abs(d - 1) < 1e-9 ? 'axis-l' : 'grid-l')).attr('x1', m.l).attr('x2', W - m.r).transition().duration(dur).attr('y1', y).attr('y2', y);
      layer(svg, 'yl').selectAll('text').data(ticks).join('text').attr('text-anchor', 'end').attr('dy', '0.32em').text(tf).transition().duration(dur).attr('x', m.l - 8).attr('y', y);
      const every = W < 480 ? 2 : 1;
      layer(svg, 'xl').selectAll('text').data(levels).join('text').attr('text-anchor', 'middle').attr('y', H - 6).attr('x', (d) => x(d)).text((d, i) => (i % every ? '' : d.slice(0, 3)));
      const ln = d3.line().x((d) => x(d.t)).y((d) => y(d.rel));
      const paths = layer(svg, 'lines').selectAll('path').data(series, (d, i) => i).join('path').style('fill', 'none').style('stroke', (d) => d.color).attr('stroke-width', 2.25).attr('stroke-linejoin', 'round').attr('stroke-dasharray', (d) => d.dash || null);
      if (dur) paths.transition().duration(dur).ease(ease).attr('d', (d) => ln(d.pts)); else paths.attr('d', (d) => ln(d.pts));
      const dots = layer(svg, 'dots').selectAll('g').data(series, (d, i) => i).join('g').style('fill', (d) => d.color)
        .selectAll('circle').data((d) => d.pts.map((pt) => ({ ...pt, s: d }))).join('circle').attr('r', 3.5).attr('cx', (d) => x(d.t))
        .on('mousemove', (ev, d) => tip.show(`${d.s.label} · ${d.t}`, [{ color: d.s.color, text: `${d3.format('+.1%')(d.rel - 1)} vs its average` }, { text: d.raw || '' }], ev)).on('mouseleave', tip.hide);
      if (dur) dots.transition().duration(dur).ease(ease).attr('cy', (d) => y(d.rel)); else dots.attr('cy', (d) => y(d.rel));
    });
    return { set(sr, lv, anim) { series = sr; levels = lv; api.draw(anim); } };
  }

  function propertiesPage(s) {
    const P = s.props, L = s.levels;
    const byId = new Map(P.map((p) => [p.id, p]));
    const modelOf = (pid) => s.models.find((md) => md.prop === pid);
    const rel = s.related_study ? study(s.related_study) : null;
    const st = { p: (P.find((p) => /gel strength/i.test(p.label)) || P[0]).id, model: null, met: null, metPicked: false };
    // property picker
    const sel = $('#pr-sel');
    sel.replaceChildren(...s.groups.map((g) => { const og = document.createElement('optgroup'); og.label = g; P.filter((p) => p.group === g).forEach((p) => og.append(new Option(p.label + (p.unit ? ` (${p.unit})` : ''), p.id))); return og; }));
    const chart = propChart($('#pr-chart'), { height: 300 });
    let ov = null;
    const ovSel = $('#ov-met');
    if (rel && ovSel) {
      ov = relLines($('#ov-chart'), { height: 240 });
      ovSel.addEventListener('change', () => { st.met = ovSel.value; st.metPicked = true; drawOverlay(true); });
    }
    function defaultMet(pid) {
      const md = modelOf(pid);
      const inRel = (x) => rel && rel.metabolites.includes(x);
      if (md) { const t = md.terms.filter((t) => t.type === 'metabolite' && inRel(t.x)).sort((a, b) => Math.abs(b.b) - Math.abs(a.b))[0]; if (t) return { m: t.x, why: `The largest metabolite coefficient in the ${md.name.toLowerCase()} model (β ${t.bl}).` }; }
      return { m: inRel('Citrate') ? 'Citrate' : rel.metabolites[0], why: '' };
    }
    function fillOverlayOptions() {
      if (!ov) return;
      const md = modelOf(st.p);
      const preds = md ? md.terms.filter((t) => t.type === 'metabolite' && rel.metabolites.includes(t.x)).map((t) => t.x) : [];
      const rest = rel.metabolites.filter((x) => !preds.includes(x)).sort((a, b) => a.localeCompare(b));
      const groups = [];
      if (preds.length) { const og = document.createElement('optgroup'); og.label = `Candidate predictors in the ${md.name.toLowerCase()} model`; preds.forEach((x) => og.append(new Option(x, x))); groups.push(og); }
      const og2 = document.createElement('optgroup'); og2.label = 'All metabolites'; rest.forEach((x) => og2.append(new Option(x, x))); groups.push(og2);
      ovSel.replaceChildren(...groups);
    }
    function drawOverlay(anim) {
      if (!ov) return;
      const p = byId.get(st.p);
      if (!st.metPicked || !rel.metabolites.includes(st.met)) { const d = defaultMet(st.p); st.met = d.m; $('#ov-why').textContent = d.why; } else $('#ov-why').textContent = '';
      ovSel.value = st.met;
      const mr = rel.rows.filter((r) => r.m === st.met);
      const series = [
        { label: p.label, color: 'var(--accent)', pts: p.rows.map((r) => ({ t: r.t, rel: r.rel, raw: `${r.ms} ± ${r.ss}${p.unit ? ' ' + p.unit : ''}` })) },
        { label: st.met, color: 'var(--s2)', dash: '5 4', pts: L.map((t) => { const r = mr.find((x) => x.t === t); return r ? { t, rel: Math.pow(2, r.l2m), raw: `${fmt(r.mean)} ± ${fmt(r.sd)} mM` } : null; }).filter(Boolean) },
      ];
      legend($('#ov-legend'), series.map((d) => [d.label, d.color]));
      ov.set(series, L, anim);
    }
    function chips() {
      const p = byId.get(st.p);
      const c = [el('span', 'chip' + (+p.p_month.replace('<', '') < 0.05 ? ' sig' : ''), `Month p ${p.p_month.startsWith('<') ? p.p_month : '= ' + p.p_month}`)];
      if (p.p_source) c.push(el('span', 'chip' + (+p.p_source.replace('<', '') < 0.05 ? ' sig' : ''), `Milk source p ${p.p_source.startsWith('<') ? p.p_source : '= ' + p.p_source}`));
      c.push(el('span', 'chip', p.milk + ' milk'));
      c.push(el('span', 'chip', `Peak ${p.peak} · lowest ${p.low}`));
      const md = modelOf(p.id);
      if (md) { const b = el('button', 'chip link', `${md.terms.filter((t) => t.type !== 'season').length} candidate predictors · see model ↓`); b.type = 'button'; b.addEventListener('click', () => { pickModel(md.name, true); $('#predictors')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }); c.push(b); }
      $('#pr-chips').replaceChildren(...c);
    }
    function showProp(anim) {
      sel.value = st.p;
      chart.set(byId.get(st.p), anim);
      chips();
      fillOverlayOptions();
      drawOverlay(anim);
      profileSel();
      const md = modelOf(st.p); if (md && st.model && md.name !== st.model) pickModel(md.name, anim);
    }
    sel.addEventListener('change', () => { st.p = sel.value; st.metPicked = false; showProp(true); });

    // seasonal profile heatmap (rows scaled within themselves)
    const hnode = $('#pf-chart');
    let heatSel = null;
    const heat = mount(hnode, (W) => {
      const rows = []; s.groups.forEach((g) => { rows.push({ head: g }); P.filter((p) => p.group === g).forEach((p) => rows.push(p)); });
      const ch = 22, top = 20, H = top + rows.length * ch + 4;
      hnode.style.setProperty('--h', H + 'px');
      hnode.replaceChildren();
      const svg = d3.select(hnode).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Each property by month against its own average');
      const narrow = W < 480;
      const lw = Math.min(measure(svg, P.map((p) => p.label)), narrow ? 120 : 220);
      const x = d3.scaleBand(d3.range(L.length), [lw + 12, W]).paddingInner(0.08);
      svg.append('g').selectAll('text').data(L).join('text').attr('x', (d, i) => x(i) + x.bandwidth() / 2).attr('y', 12).attr('text-anchor', 'middle').text((d) => (narrow ? d[0] : d.slice(0, 3)));
      const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (d, i) => `translate(0,${top + i * ch})`);
      g.filter((d) => d.head).append('text').attr('class', 'eyebrow-t').attr('x', 0).attr('y', ch / 2 + 4).text((d) => d.head.toUpperCase());
      const pr = g.filter((d) => !d.head).style('cursor', 'pointer').on('click', (ev, p) => { st.p = p.id; st.metPicked = false; showProp(true); $('#pr-chart').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); });
      pr.append('rect').attr('class', 'rowsel').attr('x', 0).attr('y', 0).attr('width', W).attr('height', ch).attr('rx', 4).style('fill', 'transparent');
      pr.append('text').attr('x', lw).attr('y', ch / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((p) => (narrow && p.label.length > 16 ? p.label.slice(0, 14) + '…' : p.label));
      pr.each(function (p) {
        const mx = d3.max(p.rows, (r) => Math.abs(Math.log2(r.rel))) || 1;
        d3.select(this).selectAll('rect.c').data(p.rows).join('rect').attr('class', 'c').attr('x', (r) => x(r.i)).attr('y', 2).attr('width', x.bandwidth()).attr('height', ch - 4).attr('rx', 2)
          .style('fill', (r) => { const v = Math.log2(r.rel) / mx; return `color-mix(in srgb, ${v >= 0 ? 'var(--pos)' : 'var(--neg)'} ${Math.round(Math.abs(v) * 85)}%, var(--surface))`; })
          .on('mousemove', (ev, r) => tip.show(`${p.label} · ${r.t}`, [{ text: `${r.ms} ± ${r.ss}${p.unit ? ' ' + p.unit : ''}` }, { text: `${d3.format('+.1%')(r.rel - 1)} vs its average` }], ev)).on('mouseleave', tip.hide);
      });
      heatSel = pr;
      profileSel();
    });
    function profileSel() { if (heatSel) heatSel.select('rect.rowsel').style('fill', (p) => (p.id === st.p ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent')); }

    // model coefficients
    const mchips = $('#md-chips');
    let bars = null;
    if (mchips && s.models.length) {
      mchips.replaceChildren(...s.models.map((md) => { const b = el('button', 'chip', md.name); b.type = 'button'; b.dataset.m = md.name; return b; }));
      mchips.addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (b) pickModel(b.dataset.m, true); });
      const macroFill = (d) => `color-mix(in srgb, ${d.v >= 0 ? 'var(--pos)' : 'var(--neg)'} 40%, var(--surface))`;
      bars = divBars($('#md-chart'), { label: 'Model coefficients', rowH: 28, valueLabels: (d) => d.bl, valueSample: ['-11.901', '21.904'],
        fill: (d) => (d.type === 'metabolite' ? null : macroFill(d)), tipText: (d) => `β = ${d.bl}, p ${d.pl.startsWith('<') ? d.pl : '= ' + d.pl}${d.type === 'metabolite' ? '' : ' · milk composition'}`,
        onPick: (d) => { if (d.type === 'metabolite' && metBy.has(d.label)) location.href = `${ROOT}metabolites/${slug(d.label)}.html`; },
        scale: (e) => [{ v: -e, l: '← lower value' }, { v: e, l: 'higher value →' }] });
      legend($('#md-legend'), [['Metabolite, higher value', 'var(--pos)'], ['Metabolite, lower value', 'var(--neg)'], ['Milk composition: fat, protein, lactose, cells (lighter)', 'color-mix(in srgb, var(--muted) 45%, var(--surface))']]);
    }
    function pickModel(name, anim) {
      if (!bars) return;
      st.model = name;
      const md = s.models.find((m) => m.name === name);
      mchips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === name)));
      const items = md.terms.filter((t) => t.type !== 'season').map((t) => ({ label: t.x, v: t.b, bl: t.bl, pl: t.pl, type: t.type })).sort((a, b) => b.v - a.v);
      $('#md-r2').innerHTML = `<b>${md.name}</b> · R²m <b class="num">${md.r2m.toFixed(2)}</b> · R²c <b class="num">${md.r2c.toFixed(2)}</b> · ${items.length} candidate predictors`;
      const se = md.terms.filter((t) => t.type === 'season');
      $('#md-season').textContent = se.length ? `The model also includes season terms (not drawn): ${se.map((t) => `${t.x.replace('season.L', 'linear').replace('season.Q', 'quadratic').replace('season.C', 'cubic')} β ${t.bl} (p ${t.pl.startsWith('<') ? t.pl : '= ' + t.pl})`).join(' · ')}.` : '';
      bars.set(items, d3.max(items, (d) => Math.abs(d.v)) * 1.05, anim);
    }
    if (bars) { const md0 = modelOf(st.p) || s.models[0]; inView($('#md-chart'), () => { if (!st.model) pickModel(md0.name, false); else pickModel(st.model, false); }); }

    // predictor map
    const mnode = $('#map-chart');
    if (mnode && s.models.length) {
      legend($('#map-legend'), [['Higher value of the property', 'var(--pos)'], ['Lower value of the property', 'var(--neg)']]);
      const short = (n) => n.replace('Time of maximum gelation', 'Time of max.').replace('Heat coagulation time', 'Heat coag. time').replace('Somatic cell count', 'Somatic cells');
      const preds = new Map();
      s.models.forEach((md) => md.terms.filter((t) => t.type !== 'season').forEach((t) => { if (!preds.has(t.x)) preds.set(t.x, { x: t.x, type: t.type, n: 0 }); preds.get(t.x).n++; }));
      const order = [...preds.values()].sort((a, b) => (a.type === 'metabolite') - (b.type === 'metabolite') || b.n - a.n || a.x.localeCompare(b.x));
      const maxB = new Map(s.models.map((md) => [md.name, d3.max(md.terms.filter((t) => t.type !== 'season'), (t) => Math.abs(t.b))]));
      let mapFirst = true;
      const map = mount(mnode, (W) => {
        const rowH = 22, narrow = W < 560;
        const head = narrow ? 92 : 46;
        const H = head + order.length * rowH + 6;
        mnode.style.setProperty('--h', H + 'px');
        mnode.replaceChildren();
        const svg = d3.select(mnode).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Candidate predictors by model');
        const lw = Math.min(measure(svg, order.map((d) => d.x)), narrow ? 130 : 220);
        const x = d3.scaleBand(s.models.map((m) => m.name), [lw + 16, W - 40]).padding(0.05);
        const r = Math.min(10, x.bandwidth() / 2 - 2, rowH / 2 - 1);
        const hd = svg.append('g').selectAll('text').data(s.models).join('text').attr('class', 'strong small-t')
          .attr('transform', (m) => `translate(${x(m.name) + x.bandwidth() / 2},${head - 10})${narrow ? ' rotate(-40)' : ''}`).attr('text-anchor', narrow ? 'start' : 'middle').text((m) => short(m.name));
        hd.append('title').text((m) => `${m.name} · R²c ${m.r2c.toFixed(2)}`);
        svg.append('text').attr('class', 'mono').attr('x', W - 4).attr('y', head - 10).attr('text-anchor', 'end').text('models');
        const intro = mapFirst && !reduce; mapFirst = false;
        const g = svg.append('g').selectAll('g').data(order).join('g').attr('transform', (d, i) => `translate(0,${head + i * rowH})`);
        g.append('rect').attr('x', 0).attr('width', W).attr('height', rowH).style('fill', (d, i) => (i % 2 ? 'transparent' : 'color-mix(in srgb, var(--line) 35%, transparent)')).attr('rx', 3);
        const nm = g.append('a').attr('href', (d) => (d.type === 'metabolite' && metBy.has(d.x) ? `${ROOT}metabolites/${slug(d.x)}.html` : null));
        nm.append('text').attr('x', lw + 4).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').attr('class', (d) => (d.type === 'metabolite' ? 'strong' : 'muted-t')).text((d) => (narrow && d.x.length > 17 ? d.x.slice(0, 15) + '…' : d.x));
        g.append('text').attr('class', 'mono').attr('x', W - 4).attr('y', rowH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').text((d) => d.n);
        g.each(function (d, i) {
          const cells = s.models.map((md) => ({ md, t: md.terms.find((t) => t.x === d.x && t.type !== 'season') })).filter((c) => c.t);
          d3.select(this).selectAll('circle').data(cells).join('circle').attr('cx', (c) => x(c.md.name) + x.bandwidth() / 2).attr('cy', rowH / 2)
            .style('fill', (c) => (c.t.b >= 0 ? 'var(--pos)' : 'var(--neg)')).style('fill-opacity', d.type === 'metabolite' ? 1 : 0.45)
            .on('mousemove', (ev, c) => tip.show(`${d.x} · ${c.md.name}`, [{ color: c.t.b >= 0 ? 'var(--pos)' : 'var(--neg)', text: `β = ${c.t.bl}, p ${c.t.pl.startsWith('<') ? c.t.pl : '= ' + c.t.pl}` }], ev)).on('mouseleave', tip.hide)
            .attr('r', intro ? 0 : (c) => Math.max(2.5, r * Math.sqrt(Math.abs(c.t.b) / maxB.get(c.md.name))))
            .transition().delay(intro ? 25 * i : 0).duration(intro ? D(450) : 0).ease(d3.easeBackOut).attr('r', (c) => Math.max(2.5, r * Math.sqrt(Math.abs(c.t.b) / maxB.get(c.md.name))));
        });
      });
      inView(mnode, () => map.draw(false));
    }

    showProp(false);
    inView(hnode, () => heat.draw(false));
  }

  // ------------------------------------------------------------ metabolite page
  function metabolitePage(name) {
    document.querySelectorAll('[data-mc-chart]').forEach((node) => {
      const s = study(node.dataset.mcChart);
      if (s.kind === 'factorial') {
        legend(document.querySelector(`[data-legend="${s.id}"]`), s.b_levels.map((b, i) => [`${b} · ${s.level_names?.[b] || b}`, SCOL(i)]));
        const g = groupedBars(node, s.a_levels, s.b_levels, { height: 280, name: () => name, label: `${name} by diet and season` });
        inView(node, () => g.set(s.rows.filter((r) => r.m === name), false));
      } else {
        const l = lineBand(node, { height: 260, name: () => name, label: `${name} through the year` });
        inView(node, () => l.set(s.rows.filter((r) => r.m === name), false));
      }
    });
  }

  // ------------------------------------------------------------ lightbox
  const lb = document.getElementById('lightbox');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.lb');
    if (!a || !lb || typeof lb.showModal !== 'function') return;
    e.preventDefault();
    lb.querySelector('img').src = a.getAttribute('href');
    lb.querySelector('img').alt = a.querySelector('img')?.alt || '';
    lb.querySelector('.lb-cap').textContent = [a.dataset.title, a.dataset.caption].filter(Boolean).join('. ');
    lb.showModal();
  });
  lb?.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });

  // ------------------------------------------------------------ boot
  const page = body.dataset.page;
  if (page === 'home') {
    const fig = $('#spectrum'); if (fig) spectrum(fig);
    document.querySelectorAll('[data-study-preview]').forEach((n) => studyPreview(n, study(n.dataset.studyPreview)));
    if (MB.cross && $('#cross-chart')) crossChart($('#cross-chart'), MB.cross);
  }
  const ex = $('#explorer'); if (ex) explorer(ex);
  if (page === 'study') { const s = study(body.dataset.study); if (s.kind === 'properties') propertiesPage(s); else if (s.kind === 'factorial') factorialPage(s); else timecoursePage(s); }
  if (page === 'metabolite') metabolitePage(body.dataset.met);
})();
