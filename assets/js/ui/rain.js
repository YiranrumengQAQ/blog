/**
 * ui/rain.js — 雨夜玻璃主题的天气引擎（默认开启，GPU 加速，不考虑性能）
 *
 * 背景 + 三层雨 + 屏幕冷凝水珠，全部实时计算：
 *   Layer 0  #rainSky   ：动态背景——优先铺满用户的背景照片
 *            （assets/img/rain-bg.jpg，cover 适配；文件缺失时静默回退
 *            渐变天空：漂移云 + 城市光斑 + 游动高光 + 闪电）
 *   Layer 1  #rainFar   ：远景细雨（数百条雨线 + 风偏摆）
 *   Layer 2  #rainNear  ：近景粗雨（粗雨线 + 落地涟漪 + 水花）
 *   Layer 3  .drop-stage：屏幕玻璃上的静态冷凝水珠——每个水珠都是一个
 *            backdrop-filter 实时透镜，对页面内容做真正的折射。
 *            只凝结、不滑落（滑动大珠与水痕已按需求移除）。
 *
 *   - 主题自适应：监听 <html data-theme>，亮/暗两套调色板实时切换。
 *   - 开关：顶栏雨滴按钮 / 按 R 键，偏好记进 localStorage（blog-rain），默认开。
 *   - GPU：所有 Canvas 按 DPR 渲染，动画全走 transform / opacity 合成层。
 */
(function () {
    'use strict';
    const Blog = (window.Blog = window.Blog || {});
    Blog.ui = Blog.ui || {};

    const STORAGE_KEY = 'blog-rain';
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    /* 背景照片：文件不存在 / 加载失败时 naturalWidth 为 0，自动回退渐变天空 */
    const BG_PHOTO = 'assets/img/rain-bg.jpg';

    /* ---------------- 调色板（亮 = 雾雨白昼，暗 = 雨夜霓虹） ---------------- */

    const PALETTES = {
        dark: {
            skyTop: '#0d1626', skyMid: '#0a1120', skyBot: '#03050c',
            glow: 'rgba(150,190,255,0.16)',
            sheen: 'rgba(190,220,255,0.05)',
            bokeh: ['#ffd9a0', '#ffb37a', '#7ab8ff', '#9d8cff', '#7fe7d2', '#ff8fb3', '#b8d4ff'],
            rainFar: '214,230,255', rainNear: '232,242,255',
            cloud: 'rgba(140,170,220,0.12)',
            flashAlpha: 0.55,
            bolt: '#dcebff'
        },
        light: {
            skyTop: '#f2f7ff', skyMid: '#ccdcee', skyBot: '#9db4d4',
            glow: 'rgba(255,255,255,0.5)',
            sheen: 'rgba(255,255,255,0.16)',
            bokeh: ['#ffffff', '#cfe2ff', '#ffe3c2', '#b9d6ff', '#ffd9e8', '#d7f4ff'],
            rainFar: '90,123,176', rainNear: '58,92,138',
            cloud: 'rgba(255,255,255,0.4)',
            flashAlpha: 0.4,
            bolt: '#ffffff'
        }
    };

    function themeNow() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function readSaved() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }
    function saveEnabled(on) {
        try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (e) { /* 忽略 */ }
    }

    /* ---------------- 工具 ---------------- */

    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];

    function makeCanvas(id) {
        const c = document.createElement('canvas');
        c.id = id;
        c.setAttribute('aria-hidden', 'true');
        return c;
    }

    /* 预渲染一张径向光斑精灵（避免每帧做 blur，高频绘制只走 drawImage 合成） */
    function makeGlowSprite(color, size, hotCore) {
        const s = document.createElement('canvas');
        s.width = s.height = size;
        const g = s.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        if (hotCore) {
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.25, color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
        } else {
            grad.addColorStop(0, color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
        }
        // 把 hex 转成带 alpha 的渐变：用 globalCompositeOperation 叠白芯
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        if (hotCore) {
            g.globalCompositeOperation = 'source-atop';
            const core = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            core.addColorStop(0, 'rgba(255,255,255,0.95)');
            core.addColorStop(0.3, 'rgba(255,255,255,0)');
            core.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = core;
            g.fillRect(0, 0, size, size);
        }
        return s;
    }

    function hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const n = parseInt(h.length === 3
            ? h.split('').map((c) => c + c).join('')
            : h, 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }

    /* ---------------- 引擎状态 ---------------- */

    const S = {
        enabled: readSaved() !== 'off',
        running: false,
        theme: themeNow(),
        W: 0, H: 0,
        wind: 30, windTarget: 30, windTimer: 0,
        flash: 0, bolt: null, boltLife: 0, nextStrike: 0,
        skyGrad: null, glowGrad: null,
        clouds: [], bokeh: [], sheens: [],
        far: [], near: [], ripples: [],
        beads: [], micros: [],
        bgImg: null,
        last: 0,
        els: null,
        /* 生命周期 */
        inited: false,
        raf: 0,
        paused: false,      // 页面不可见时的暂停（与 enabled 正交）
        reduced: false,     // 系统「减少动态」
        listeners: []       // 统一登记，destroy() 时全部摘掉
    };

    /** 唯一状态源：blog-rain → S.enabled → html/body class → 按钮 aria-pressed */
    function reducedMotion() {
        try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
        catch (e) { return false; }
    }

    /** 所有事件监听都走这里，destroy() 才能保证不泄漏 */
    function on(target, type, handler, opts) {
        target.addEventListener(type, handler, opts);
        S.listeners.push([target, type, handler, opts]);
    }

    /* ---------------- DOM 舞台 ---------------- */

    function buildStage() {
        if (S.els) return S.els;

        const stage = document.createElement('div');
        stage.className = 'rain-stage';
        stage.id = 'rainStage';
        stage.setAttribute('aria-hidden', 'true');

        const sky = makeCanvas('rainSky');
        const aurora = document.createElement('div');
        aurora.className = 'rain-aurora';
        aurora.innerHTML = '<i></i><i></i><i></i>';
        const far = makeCanvas('rainFar');
        const near = makeCanvas('rainNear');
        const mist1 = document.createElement('div');
        mist1.className = 'rain-mist m1';
        const mist2 = document.createElement('div');
        mist2.className = 'rain-mist m2';
        const lightning = document.createElement('div');
        lightning.className = 'rain-lightning';
        const vignette = document.createElement('div');
        vignette.className = 'rain-vignette';
        const grain = document.createElement('div');
        grain.className = 'rain-grain';

        stage.appendChild(sky);
        stage.appendChild(aurora);
        stage.appendChild(far);
        stage.appendChild(near);
        stage.appendChild(mist1);
        stage.appendChild(mist2);
        stage.appendChild(lightning);
        stage.appendChild(vignette);
        stage.appendChild(grain);
        document.body.insertBefore(stage, document.body.firstChild);

        const dropStage = document.createElement('div');
        dropStage.className = 'drop-stage';
        dropStage.id = 'dropStage';
        dropStage.setAttribute('aria-hidden', 'true');
        const dropLayer = document.createElement('div');
        dropLayer.id = 'dropLayer';
        dropStage.appendChild(dropLayer);
        document.body.appendChild(dropStage);

        S.els = {
            stage, sky, far, near, lightning,
            dropStage, dropLayer,
            skyCtx: sky.getContext('2d'),
            farCtx: far.getContext('2d'),
            nearCtx: near.getContext('2d')
        };
        return S.els;
    }

    /* ---------------- 粒子群初始化 ---------------- */

    function seedSky() {
        const P = PALETTES[S.theme];
        S.clouds = [];
        for (let i = 0; i < 7; i++) {
            S.clouds.push({
                x: Math.random(), y: rand(0, 0.55),
                rx: rand(0.22, 0.45), ry: rand(0.1, 0.2),
                vx: rand(0.004, 0.014) * (Math.random() < 0.5 ? 1 : 1),
                alpha: rand(0.5, 1)
            });
        }
        S.bokeh = [];
        const n = Math.max(46, Math.min(90, (S.W * S.H) / 22000));
        for (let i = 0; i < n; i++) {
            S.bokeh.push({
                x: Math.random(), y: rand(0.05, 0.95),
                r: rand(6, 42) * (S.W < 768 ? 0.7 : 1),
                color: pick(P.bokeh),
                phase: rand(0, Math.PI * 2),
                speed: rand(0.4, 1.6),
                drift: rand(4, 22),
                sway: rand(0, Math.PI * 2),
                base: rand(0.1, 0.42)
            });
        }
        S.sheens = [];
        for (let i = 0; i < 3; i++) {
            S.sheens.push({ x: Math.random(), w: rand(0.1, 0.22), v: rand(0.02, 0.05) });
        }
        // 光斑精灵按主题预渲染
        S.sprites = {};
        P.bokeh.forEach((c) => { S.sprites[c] = makeGlowSprite(c, 128, true); });
        S.cloudSprite = makeGlowSprite('#ffffff', 256, false);
    }

    function seedRain() {
        const area = S.W * S.H;
        const small = S.W < 768;
        const farN = Math.max(140, Math.min(small ? 240 : 420, area / 4200));
        const nearN = Math.max(50, Math.min(small ? 90 : 150, area / 13000));
        S.far = [];
        for (let i = 0; i < farN; i++) {
            S.far.push({
                x: rand(-100, S.W + 100), y: rand(-S.H, S.H),
                len: rand(34, 90), sp: rand(480, 920),
                a: rand(0.1, 0.26), drift: rand(0.7, 1.2)
            });
        }
        S.near = [];
        for (let i = 0; i < nearN; i++) {
            S.near.push({
                x: rand(-140, S.W + 140), y: rand(-S.H, S.H),
                len: rand(90, 190), sp: rand(950, 1650),
                w: rand(1.3, 2.4), a: rand(0.22, 0.45), drift: rand(0.9, 1.3)
            });
        }
        S.ripples = [];
    }

    /* ---------------- 水珠（DOM 真折射透镜） ---------------- */

    function dropEl(cls, r) {
        const el = document.createElement('div');
        el.className = 'gdrop ' + cls;
        el.style.width = el.style.height = r.toFixed(1) + 'px';
        el.style.marginLeft = el.style.marginTop = (-r / 2).toFixed(1) + 'px';
        return el;
    }

    function seedDroplets() {
        const { dropLayer } = S.els;
        dropLayer.innerHTML = '';
        const small = S.W < 768;
        const nBead = small ? 22 : 42;
        const nMicro = small ? 52 : 96;

        S.beads = [];
        for (let i = 0; i < nBead; i++) {
            const r = rand(3, 8);
            const el = dropEl('bead', r * 2);
            const x = rand(0, S.W), y = rand(0, S.H);
            el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
            dropLayer.appendChild(el);
            S.beads.push({ el, r, x, y, grow: rand(0.1, 0.4) });
        }
        S.micros = [];
        for (let i = 0; i < nMicro; i++) {
            S.micros.push(spawnMicro(rand(0, S.W), rand(0, S.H), true));
        }
    }

    function spawnMicro(x, y, randomDelay) {
        const r = rand(1, 3.2);
        const el = dropEl('micro', r * 2);
        if (randomDelay) el.style.animationDelay = rand(-3.6, 0).toFixed(2) + 's';
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
        S.els.dropLayer.appendChild(el);
        return { el, r, x, y };
    }



    /* ---------------- 尺寸 ---------------- */

    function resize() {
        buildStage();
        S.W = window.innerWidth;
        S.H = window.innerHeight;
        const { sky, far, near, skyCtx, farCtx, nearCtx } = S.els;
        [[sky, skyCtx], [far, farCtx], [near, nearCtx]].forEach(([c, ctx]) => {
            c.width = Math.round(S.W * DPR);
            c.height = Math.round(S.H * DPR);
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        });
        const P = PALETTES[S.theme];
        S.skyGrad = skyCtx.createLinearGradient(0, 0, 0, S.H);
        S.skyGrad.addColorStop(0, P.skyTop);
        S.skyGrad.addColorStop(0.45, P.skyMid);
        S.skyGrad.addColorStop(1, P.skyBot);
        S.glowGrad = skyCtx.createRadialGradient(S.W / 2, -S.H * 0.25, 0, S.W / 2, -S.H * 0.25, S.H * 1.1);
        S.glowGrad.addColorStop(0, P.glow);
        S.glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
        seedSky();
        seedRain();
        seedDroplets();
    }

    /* ---------------- 闪电 ---------------- */

    function scheduleStrike(now) {
        S.nextStrike = now + rand(7000, 22000);
    }

    function strike() {
        S.flash = 1;
        S.boltLife = rand(180, 320);
        const x0 = rand(S.W * 0.1, S.W * 0.9);
        const pts = [{ x: x0, y: -20 }];
        let x = x0, y = -20;
        const segs = 9 + ((Math.random() * 5) | 0);
        const targetY = S.H * rand(0.35, 0.6);
        for (let i = 0; i < segs; i++) {
            x += rand(-46, 46);
            y += (targetY / segs) * rand(0.7, 1.3);
            pts.push({ x, y });
        }
        S.bolt = pts;
        // 35% 概率双重闪：120ms 后再闪一次
        if (Math.random() < 0.35) {
            setTimeout(() => { if (S.running) S.flash = Math.max(S.flash, 0.7); }, 130);
        }
    }

    /* ---------------- 帧更新 ---------------- */

    function updateWind(dt, now) {
        S.windTimer -= dt * 1000;
        if (S.windTimer <= 0) {
            S.windTarget = rand(-70, 90);
            S.windTimer = rand(3500, 9000);
        }
        S.wind += (S.windTarget - S.wind) * Math.min(1, dt * 0.6);
        return S.wind + Math.sin(now * 0.0004) * 14;
    }

    function paintSky(ctx, dt, now, wind) {
        const P = PALETTES[S.theme];
        const t = now * 0.001;
        // 背景：优先铺满用户的背景照片（cover 居中裁切）；
        // 图片不存在 / 还没加载好时静默回退渐变天空
        const img = S.bgImg;
        if (img && img.naturalWidth) {
            const scale = Math.max(S.W / img.naturalWidth, S.H / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, (S.W - dw) / 2, (S.H - dh) / 2, dw, dh);
        } else {
            ctx.fillStyle = S.skyGrad;
            ctx.fillRect(0, 0, S.W, S.H);
        }
        ctx.fillStyle = S.glowGrad;
        ctx.fillRect(0, 0, S.W, S.H);

        // 云：预渲染精灵拉伸漂移
        // （alpha 从调色板的 cloud rgba 串里解析；直接引用不存在的
        //  P.cloudAlpha 会得到 NaN，赋值被 Canvas 忽略 → 云按全透明绘制）
        ctx.save();
        const cloudA = parseFloat((/([\d.]+)\)\s*$/.exec(P.cloud) || [])[1]) || 1;
        S.clouds.forEach((c) => {
            c.x += c.vx * dt;
            if (c.x - c.rx > 1) c.x = -c.rx;
            const w = S.W * c.rx * 2, h = S.H * c.ry * 2;
            ctx.globalAlpha = cloudA * c.alpha;
            ctx.drawImage(S.cloudSprite, c.x * S.W - w / 2, c.y * S.H - h / 2, w, h);
        });
        ctx.restore();

        // 城市光斑：呼吸 + 缓慢上浮 + 摇摆
        S.bokeh.forEach((b) => {
            b.y -= (b.drift * dt) / S.H;
            if (b.y < -0.06) { b.y = 1.02; b.x = Math.random(); }
            const tw = b.base + Math.sin(t * b.speed + b.phase) * b.base * 0.7;
            const x = (b.x + Math.sin(t * 0.24 + b.sway) * 0.012) * S.W;
            const y = b.y * S.H;
            const pulse = 1 + Math.sin(t * b.speed + b.phase) * 0.12;
            const s = b.r * 2 * pulse;
            ctx.globalAlpha = Math.max(0.02, tw);
            ctx.drawImage(S.sprites[b.color], x - s / 2, y - s / 2, s, s);
        });
        ctx.globalAlpha = 1;

        // 游动斜向高光带
        ctx.save();
        ctx.translate(S.W / 2, S.H / 2);
        ctx.rotate(-0.32);
        ctx.translate(-S.W / 2, -S.H / 2);
        S.sheens.forEach((sh) => {
            sh.x += sh.v * dt;
            if (sh.x > 1.4) sh.x = -0.4;
            const x = sh.x * S.W * 1.6 - S.W * 0.3;
            const g = ctx.createLinearGradient(x, 0, x + S.W * sh.w, 0);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, P.sheen);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(x, -S.H * 0.4, S.W * sh.w, S.H * 1.8);
        });
        ctx.restore();

        // 闪电：泛光 + 分叉电弧
        if (S.flash > 0.01 || S.boltLife > 0) {
            if (S.flash > 0.01) {
                ctx.fillStyle = `rgba(225,238,255,${(S.flash * P.flashAlpha).toFixed(3)})`;
                ctx.fillRect(0, 0, S.W, S.H);
            }
            if (S.bolt && S.boltLife > 0) {
                S.boltLife -= dt * 1000;
                const a = Math.max(0, Math.min(1, S.boltLife / 220));
                ctx.save();
                ctx.globalAlpha = a;
                ctx.strokeStyle = P.bolt;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = P.bolt;
                ctx.shadowBlur = 26;
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                S.bolt.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
                ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.lineWidth = 1.1;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
                ctx.restore();
                if (S.boltLife <= 0) S.bolt = null;
            }
            S.flash *= Math.exp(-dt * 7);
            S.els.lightning.style.opacity = (S.flash * 0.55).toFixed(3);
        } else if (S.els.lightning.style.opacity !== '0') {
            S.els.lightning.style.opacity = '0';
        }

        if (now > S.nextStrike && S.enabled) {
            strike();
            scheduleStrike(now);
        }
    }

    function paintFar(ctx, dt, wind) {
        const P = PALETTES[S.theme];
        ctx.lineCap = 'round';
        ctx.lineWidth = 1;
        S.far.forEach((d) => {
            d.y += d.sp * dt;
            d.x += wind * d.drift * dt * (d.sp / 700);
            if (d.y > S.H + 100) {
                d.y = rand(-160, -20);
                d.x = rand(-120, S.W + 60);
            }
            if (d.x > S.W + 120) d.x = -110;
            if (d.x < -130) d.x = S.W + 100;
            const slant = wind * 0.045 * d.drift;
            ctx.strokeStyle = `rgba(${P.rainFar},${d.a.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - slant * (d.len / 60), d.y - d.len);
            ctx.stroke();
        });
    }

    function paintNear(ctx, dt, wind) {
        const P = PALETTES[S.theme];
        ctx.lineCap = 'round';
        S.near.forEach((d) => {
            d.y += d.sp * dt;
            d.x += wind * d.drift * dt * (d.sp / 1100);
            const ground = S.H - rand(0, 0); // 落地即碎
            if (d.y > S.H + 60 || d.y > ground + 40) {
                if (d.y < S.H + 120 && S.ripples.length < 90 && Math.random() < 0.6) {
                    S.ripples.push({ x: d.x, y: S.H - rand(2, 46), r: rand(2, 5), vr: rand(60, 130), a: rand(0.25, 0.5) });
                }
                d.y = rand(-260, -40);
                d.x = rand(-180, S.W + 80);
            }
            if (d.x > S.W + 200) d.x = -180;
            if (d.x < -200) d.x = S.W + 160;
            const slant = wind * 0.06 * d.drift;
            ctx.strokeStyle = `rgba(${P.rainNear},${d.a.toFixed(3)})`;
            ctx.lineWidth = d.w;
            ctx.beginPath();
            ctx.moveTo(d.x, d.y);
            ctx.lineTo(d.x - slant * (d.len / 110), d.y - d.len);
            ctx.stroke();
        });
        // 涟漪：落地的水晕
        for (let i = S.ripples.length - 1; i >= 0; i--) {
            const r = S.ripples[i];
            r.r += r.vr * dt;
            r.a -= dt * 0.9;
            if (r.a <= 0 || r.r > 46) {
                S.ripples.splice(i, 1);
                continue;
            }
            ctx.strokeStyle = `rgba(${P.rainNear},${r.a.toFixed(3)})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.ellipse(r.x, r.y, r.r, r.r * 0.36, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    }

    function updateDroplets(dt) {
        // 静珠：缓慢长大；长到临界就"抖落蒸发"，换到别处重新凝结成一颗小珠
        S.beads.forEach((b) => {
            b.r += b.grow * dt;
            if (b.r > 8.5) {
                b.r = rand(2.5, 4.5);
                b.grow = rand(0.1, 0.4);
                b.x = rand(0, S.W);
                b.y = rand(0, S.H * 0.7);
            }
            const d = (b.r * 2).toFixed(1);
            b.el.style.width = b.el.style.height = d + 'px';
            b.el.style.marginLeft = b.el.style.marginTop = (-b.r).toFixed(1) + 'px';
            b.el.style.transform = `translate3d(${b.x.toFixed(1)}px,${b.y.toFixed(1)}px,0)`;
        });

        // 微珠：偶尔新生，保持凝露密度
        if (S.micros.length < 70 && Math.random() < 0.3) {
            S.micros.push(spawnMicro(rand(0, S.W), rand(0, S.H), false));
        }
    }

    /* ---------------- 主循环 ---------------- */

    function frame(now) {
        S.raf = 0;
        if (!S.running || S.paused) return;
        S.raf = requestAnimationFrame(frame);
        let dt = (now - S.last) / 1000;
        S.last = now;
        if (!(dt > 0)) return;
        if (dt > 0.05) dt = 0.05; // 切后台回来时钳住，避免穿墙

        const wind = updateWind(dt, now);
        const { skyCtx, farCtx, nearCtx } = S.els;
        paintSky(skyCtx, dt, now, wind);
        paintFar(farCtx, dt, wind);
        paintNear(nearCtx, dt, wind);
        updateDroplets(dt);
    }

    /* ---------------- 开关 ---------------- */

    function applyToggleUI() {
        document.querySelectorAll('#rainToggle').forEach((btn) => {
            btn.classList.toggle('is-on', S.enabled);
            btn.classList.toggle('is-off', !S.enabled);
            btn.setAttribute('aria-pressed', String(S.enabled));
        });
        document.body.classList.toggle('rain-off', !S.enabled);
        document.documentElement.classList.toggle('rain-off', !S.enabled);
    }

    function start() {
        if (S.running) return;
        S.running = true;
        S.last = performance.now();
        scheduleStrike(S.last + 2500);
        if (S.els) {
            S.els.stage.style.display = '';
            S.els.dropStage.style.display = '';
        }
        if (!S.raf) S.raf = requestAnimationFrame(frame);
    }

    function stop() {
        S.running = false;
        if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        if (S.els) {
            S.els.stage.style.display = 'none';
            S.els.dropStage.style.display = 'none';
        }
    }

    /** 标签页切后台：停帧、停闪电计时；回来时把时间基准重置，避免闪电连炸 */
    function pause() {
        if (S.paused) return;
        S.paused = true;
        if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
    }
    function resume() {
        if (!S.paused) return;
        S.paused = false;
        S.last = performance.now();
        scheduleStrike(S.last + 1200);   // 回到前台不立刻连续闪电
        if (S.running && !S.raf) S.raf = requestAnimationFrame(frame);
    }

    function setEnabled(on) {
        S.enabled = !!on;
        saveEnabled(S.enabled);
        applyToggleUI();
        if (!S.enabled) { stop(); return; }
        resize();
        if (S.reduced) { S.running = true; frame(performance.now()); stop(); }
        else start();
    }

    function toggle() {
        setEnabled(!S.enabled);
        return S.enabled;
    }

    /* ---------------- 初始化 ---------------- */

    let resizeTimer = 0;

    let themeObserver = null;

    function init() {
        if (S.inited) return;          // 重复 init 直接短路，杜绝雨幕/监听叠加
        S.inited = true;
        S.reduced = reducedMotion();
        buildStage();
        applyToggleUI();

        // 背景照片：加载失败（404 / 断网）不报错，paintSky 自动回退渐变
        try {
            S.bgImg = new Image();
            S.bgImg.decoding = 'async';
            S.bgImg.src = BG_PHOTO;
        } catch (e) { S.bgImg = null; }

        resize();

        const onResize = () => {
            clearTimeout(resizeTimer);
            // 移动端地址栏收缩 / 旋转屏幕都会改变 innerHeight，必须重算 Canvas 尺寸
            resizeTimer = setTimeout(() => { if (S.enabled) resize(); }, 220);
        };
        on(window, 'resize', onResize);
        on(window, 'orientationchange', onResize);

        // 页面不可见时停帧：回来不会一次性补算、不会连续闪电
        on(document, 'visibilitychange', () => {
            if (document.visibilityState === 'hidden') pause();
            else resume();
        });

        // 系统「减少动态」：保留静态雨夜画面，只渲染一帧就停
        try {
            const mqm = window.matchMedia('(prefers-reduced-motion: reduce)');
            const onMotion = (e) => {
                S.reduced = e.matches;
                if (S.reduced) { if (S.running) { frame(performance.now()); stop(); } }
                else if (S.enabled) start();
            };
            if (mqm.addEventListener) mqm.addEventListener('change', onMotion);
        } catch (e) { /* 忽略 */ }

        // 主题切换 → 重建调色板与精灵（雨不停，只换天气颜色）
        const applyTheme = () => {
            const next = themeNow();
            if (next === S.theme) return;
            S.theme = next;
            const P = PALETTES[next];
            const { skyCtx } = S.els;
            S.skyGrad = skyCtx.createLinearGradient(0, 0, 0, S.H);
            S.skyGrad.addColorStop(0, P.skyTop);
            S.skyGrad.addColorStop(0.45, P.skyMid);
            S.skyGrad.addColorStop(1, P.skyBot);
            S.glowGrad = skyCtx.createRadialGradient(S.W / 2, -S.H * 0.25, 0, S.W / 2, -S.H * 0.25, S.H * 1.1);
            S.glowGrad.addColorStop(0, P.glow);
            S.glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
            seedSky();
        };
        try {
            themeObserver = new MutationObserver(applyTheme);
            themeObserver.observe(document.documentElement, {
                attributes: true, attributeFilter: ['data-theme']
            });
        } catch (e) { /* 老浏览器没有 Observer：主题色下次 resize 时生效 */ }
        on(document, 'blog:theme', applyTheme);

        // 开关按钮（阅读页 + 写作助手各一枚，id 相同）
        document.querySelectorAll('#rainToggle').forEach((btn) => {
            on(btn, 'click', () => toggle());
        });
        // 快捷键 R（输入框里不触发）
        on(document, 'keydown', (e) => {
            if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const tag = (document.activeElement && document.activeElement.tagName) || '';
                if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
                toggle();
            }
        });

        if (S.enabled && !S.reduced) {
            start();
        } else if (S.enabled && S.reduced) {
            // 静态雨夜：画一帧留住画面，不跑动画
            S.running = true;
            frame(performance.now());
            stop();
        } else {
            stop();
        }
    }

    /** 彻底销毁：摘监听、停 raf、清定时器、删 DOM。重复初始化前必须调用 */
    function destroy() {
        stop();
        clearTimeout(resizeTimer);
        S.listeners.forEach(([t, type, h, o]) => {
            try { t.removeEventListener(type, h, o); } catch (e) { /* 忽略 */ }
        });
        S.listeners = [];
        if (themeObserver) { try { themeObserver.disconnect(); } catch (e) { /* 忽略 */ } themeObserver = null; }
        if (S.els) {
            if (S.els.stage.parentNode) S.els.stage.parentNode.removeChild(S.els.stage);
            if (S.els.dropStage.parentNode) S.els.dropStage.parentNode.removeChild(S.els.dropStage);
        }
        S.els = null;
        S.beads = []; S.micros = []; S.ripples = []; S.far = []; S.near = [];
        S.inited = false;
        S.paused = false;
    }

    /** 路由切页 / 语言切换后重新挂载：先销毁再初始化，绝不叠加 */
    function refresh() {
        if (!S.inited) { init(); return; }
        if (S.enabled) resize();
    }

    Blog.ui.rain = {
        init, destroy, refresh, toggle, setEnabled, pause, resume,
        isEnabled: () => S.enabled
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
