// Loading screen: the Enter button bursts into the missing letters "ool", "attle", and "ame".
// Each letter flies from the button into its exact place after the existing C, B, and G.
const L = document.getElementById('cbgLoader');
if (L) {
    const btn = document.getElementById('cbgEnter');
    const title = document.getElementById('loaderTitle');
    const real = document.getElementById('gameTitle');
    const ready = () => { btn.disabled = false; btn.firstElementChild.textContent = 'Press Enter'; btn.focus(); };
    const poll = setInterval(() => { if (window.__luminary) { clearInterval(poll); ready(); } }, 80);
    let started = false;

    const go = () => {
        if (started || btn.disabled) return;
        started = true;

        // Build individual target letters while keeping the original red C, B, and G.
        const words = ['ool', 'attle', 'ame'];
        const targets = [...title.querySelectorAll('.cu')];
        targets.forEach((word, i) => {
            word.textContent = '';
            word.classList.add('cbg-word');
            for (const char of words[i]) {
                const span = document.createElement('span');
                span.className = 'cbg-letter';
                span.textContent = char;
                word.appendChild(span);
            }
        });

        title.classList.remove('collapsed', 'pop');
        title.classList.add('cbg-assembling');
        targets.forEach(word => { word.style.maxWidth = 'none'; word.style.opacity = '1'; });

        const buttonRect = btn.getBoundingClientRect();
        const startX = buttonRect.left + buttonRect.width / 2;
        const startY = buttonRect.top + buttonRect.height / 2;
        btn.style.visibility = 'hidden';

        // Wait one frame so the full title has its final layout, then fly every letter home.
        requestAnimationFrame(() => {
            const letters = [...title.querySelectorAll('.cbg-letter')];
            letters.forEach((letter, index) => {
                const r = letter.getBoundingClientRect();
                const targetX = r.left + r.width / 2;
                const targetY = r.top + r.height / 2;
                letter.style.visibility = 'hidden';

                const shard = document.createElement('span');
                shard.className = 'cbg-shard';
                shard.textContent = letter.textContent;
                shard.style.left = startX + 'px';
                shard.style.top = startY + 'px';
                document.body.appendChild(shard);

                const dx = targetX - startX;
                const dy = targetY - startY;
                const angle = Math.random() * Math.PI * 2;
                const burst = 65 + Math.random() * 95;
                const bx = Math.cos(angle) * burst;
                const by = Math.sin(angle) * burst;
                const delay = index * 34;

                shard.animate([
                    { transform: 'translate(-50%,-50%) scale(.35) rotate(0deg)', opacity: 0 },
                    { transform: `translate(calc(-50% + ${bx}px),calc(-50% + ${by}px)) scale(1.2) rotate(${Math.random() * 90 - 45}deg)`, opacity: 1, offset: .24 },
                    { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(1) rotate(0deg)`, opacity: 1 }
                ], {
                    duration: 1250 + Math.random() * 350,
                    delay,
                    easing: 'cubic-bezier(.18,.72,.22,1)',
                    fill: 'forwards'
                }).onfinish = () => {
                    letter.style.visibility = 'visible';
                    shard.remove();
                };
            });

            // Once all the letters have arrived, move the completed title into the menu.
            const totalTime = 1250 + 350 + letters.length * 34 + 250;
            setTimeout(() => {
                const a = title.getBoundingClientRect();
                const b = real.getBoundingClientRect();
                const scale = b.width / a.width;
                title.style.transition = 'transform 1.6s cubic-bezier(.65,0,.25,1)';
                title.style.transformOrigin = 'center center';
                title.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px,${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(${scale})`;
                L.classList.add('fade');
                setTimeout(() => { real.style.visibility = ''; L.classList.add('gone'); }, 1700);
            }, totalTime);
        });
    };

    real.style.visibility = 'hidden';
    btn.addEventListener('click', go);
    window.addEventListener('keydown', e => {
        if (!started && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.stopPropagation();
            go();
        }
    }, true);
}
