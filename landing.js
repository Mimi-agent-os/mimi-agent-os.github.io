// The landing's motion: rows rising in on scroll, the chat demo and the channel diagram.
// The HTML already holds every final state, so with reduced motion nothing here moves and the page is complete.

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const EASE = "cubic-bezier(.16,1,.3,1)";

// A clock that runs only while its element is on screen and the tab is visible; the element's animations pause with it
function watch(element) {
    let onScreen = false;
    let running = null;
    let ticking = false;
    let now = 0;
    let last = 0;
    let waiting = [];

    const tick = (time) => {
        ticking = running && waiting.length > 0;
        if (!ticking) return;
        now += Math.min(Math.max(time - last, 0), 100);
        last = time;
        const due = waiting.filter((w) => w.at <= now);
        waiting = waiting.filter((w) => w.at > now);
        for (const w of due) w.resolve();
        requestAnimationFrame(tick);
    };
    const start = () => {
        if (ticking || !running || waiting.length === 0) return;
        ticking = true;
        last = performance.now();
        requestAnimationFrame(tick);
    };
    const update = () => {
        const run = onScreen && !document.hidden;
        if (run === running) return;
        running = run;
        for (const animation of element.getAnimations({ subtree: true })) {
            if (run && animation.playState === "paused") animation.play();
            if (!run && animation.playState === "running") animation.pause();
        }
        start();
    };

    new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        update();
    }, { threshold: 0.2 }).observe(element);
    document.addEventListener("visibilitychange", update);

    return {
        wait: (ms) =>
            new Promise((resolve) => {
                waiting.push({ at: now + ms, resolve });
                start();
            }),
    };
}

// Rows below the fold rise in once as they arrive; anything already on screen stays put
function revealOnScroll() {
    const later = [...document.querySelectorAll("[data-reveal]")].filter(
        (element) => element.getBoundingClientRect().top > innerHeight,
    );
    const observer = new IntersectionObserver(
        (entries) => {
            const arrived = entries.filter((entry) => entry.isIntersecting);
            arrived.forEach((entry, i) => {
                entry.target.style.transitionDelay = `${i * 70}ms`;
                entry.target.classList.remove("pre");
                observer.unobserve(entry.target);
            });
        },
        { rootMargin: "0px 0px -8% 0px" },
    );
    for (const element of later) {
        element.classList.add("pre");
        observer.observe(element);
    }
}

// The chat demo: you ask wren to move a meeting, wren checks the calendar, the write waits on Allow, wren confirms
async function playDemo(demo) {
    const { wait } = watch(demo);
    const thread = demo.querySelector("[data-thread]");
    const composer = demo.querySelector(".composer");
    const typed = demo.querySelector("[data-typed]");
    const placeholder = demo.querySelector("[data-placeholder]");
    const send = demo.querySelector("[data-send]");
    const busy = demo.querySelectorAll("[data-busy]");
    const ask = demo.querySelector('[data-step="ask"]');
    const typing = demo.querySelector('[data-step="typing"]');
    const calls = [...demo.querySelectorAll('[data-step="call"]')];
    const [say, done] = demo.querySelectorAll('[data-step="say"]');
    const gate = demo.querySelector('[data-step="gate"]');
    const allowed = demo.querySelector('[data-step="allowed"]');
    const meta = demo.querySelector('[data-step="meta"]');
    const allow = demo.querySelector("[data-allow]");
    const countdown = demo.querySelector("[data-countdown]");
    const askText = ask.querySelector(".msg-body").textContent;
    const sayBody = say.querySelector("[data-stream]");
    const sayText = sayBody.textContent;
    const doneBody = done.querySelector("[data-stream]");
    const doneText = doneBody.textContent;

    // The thread keeps its bottom edge, so a change that grows it slides the older lines up rather than jumping
    const change = (update) => {
        const before = thread.offsetTop;
        update();
        const moved = before - thread.offsetTop;
        if (moved === 0) return;
        const offset = new DOMMatrix(getComputedStyle(thread).transform).m42;
        for (const animation of thread.getAnimations()) if (animation.id === "slide") animation.cancel();
        thread.animate([{ transform: `translateY(${offset + moved}px)` }, { transform: "none" }], {
            id: "slide",
            duration: 260,
            easing: EASE,
        });
    };
    const show = (element) => {
        change(() => {
            element.hidden = false;
        });
        element.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
            duration: 200,
            easing: EASE,
        });
    };
    const stream = async (body, text) => {
        const words = text.split(/(?<= )/);
        for (let i = 0; i < words.length; ) {
            const n = 1 + Math.floor(Math.random() * 3);
            const chunk = words.slice(i, i + n).join("");
            i += n;
            change(() => {
                body.textContent += chunk;
            });
            await wait(50 + Math.random() * 60);
        }
    };
    const press = async (button) => {
        button.classList.add("pressed");
        await wait(170);
        button.classList.remove("pressed");
    };
    const setBusy = (on) => {
        placeholder.textContent = on ? "Queue a follow-up" : "Message wren";
        send.hidden = on;
        for (const button of busy) button.hidden = !on;
    };

    let gone = null;
    for (;;) {
        for (const element of [ask, typing, ...calls, say, gate, allowed, done, meta]) element.hidden = true;
        for (const call of calls) call.querySelector(".call-dot").classList.add("pending");
        sayBody.textContent = "";
        doneBody.textContent = "";
        countdown.textContent = "5:00";
        setBusy(false);
        if (gone) {
            gone.cancel();
            thread.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE });
        }
        await wait(900);

        composer.toggleAttribute("data-typing", true);
        for (const char of askText) {
            change(() => {
                typed.textContent += char;
            });
            await wait(char === " " ? 70 : 26 + Math.random() * 44);
        }
        await wait(420);
        await press(send);
        composer.toggleAttribute("data-typing", false);
        change(() => {
            typed.textContent = "";
        });
        setBusy(true);
        show(ask);
        await wait(450);
        show(typing);
        await wait(900);

        for (const call of calls) {
            show(call);
            await wait(750);
            call.querySelector(".call-dot").classList.remove("pending");
            await wait(250);
        }
        change(() => {
            typing.hidden = true;
        });
        show(say);
        await stream(sayBody, sayText);
        await wait(500);

        show(gate);
        for (const left of ["4:59", "4:58", "4:57"]) {
            await wait(1000);
            countdown.textContent = left;
        }
        await press(allow);
        await wait(120);
        change(() => {
            gate.hidden = true;
            allowed.hidden = false;
        });
        allowed.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE });
        await wait(1100);

        show(done);
        await stream(doneBody, doneText);
        show(meta);
        setBusy(false);
        await wait(5600);

        gone = thread.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: EASE, fill: "forwards" });
        await gone.finished;
    }
}

// The channel: a message is plain text in the app and the gateway, and ciphertext on the network between them
async function playChannel(fit) {
    const { wait } = watch(fit);
    const appAsk = fit.querySelector('[data-view="app-ask"]');
    const appAnswer = fit.querySelector('[data-view="app-answer"]');
    const net = fit.querySelector('[data-view="net"]');
    const gatewayAsk = fit.querySelector('[data-view="gw-ask"]');
    const gatewayAnswer = fit.querySelector('[data-view="gw-answer"]');
    const packet = fit.querySelector("[data-wire] .packet");
    const vertical = matchMedia("(max-width: 900px)");
    const talks = [
        ["Move the review to Thursday.", "Moved to Thursday, 15:00."],
        ["What is on Friday?", "Two meetings, both after lunch."],
        ["Remember: no calls before 10.", "Saved to memory."],
    ];

    const put = (element, text) => {
        element.textContent = text;
        element.style.visibility = text ? "" : "hidden";
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: EASE });
    };
    const seal = (text) =>
        Array.from({ length: Math.max(6, Math.ceil(text.length / 2.4)) }, () =>
            Math.floor(Math.random() * 0x10000)
                .toString(16)
                .padStart(4, "0"),
        ).join(" ");
    const carry = (sealed, back) => {
        packet.firstElementChild.textContent = sealed.slice(0, 9);
        packet.toggleAttribute("data-back", back);
        const axis = vertical.matches ? "Y" : "X";
        // across, the wire is wide enough that the packet is out of sight past 62% either way
        const reach = vertical.matches ? 100 : 62;
        const [from, to] = back ? [`${reach}%`, `-${reach}%`] : [`-${reach}%`, `${reach}%`];
        return packet.animate(
            [
                { opacity: 1, transform: `translate${axis}(${from})` },
                { opacity: 1, transform: `translate${axis}(${to})` },
            ],
            { duration: vertical.matches ? 1150 : 1500, easing: "cubic-bezier(.45,0,.55,1)" },
        ).finished;
    };

    for (let turn = 0; ; turn++) {
        const [ask, answer] = talks[turn % talks.length];
        await wait(turn === 0 ? 600 : 0);
        put(appAsk, ask);
        put(appAnswer, "");
        put(gatewayAsk, "");
        put(gatewayAnswer, "");
        await wait(900);

        const sealed = seal(ask);
        put(net, sealed);
        await carry(sealed, false);
        put(gatewayAsk, ask);
        await wait(1500);

        put(gatewayAnswer, answer);
        await wait(500);
        const reply = seal(answer);
        put(net, reply);
        await carry(reply, true);
        put(appAnswer, answer);
        await wait(3400);
    }
}

if (!still) {
    revealOnScroll();
    playDemo(document.querySelector("[data-demo]"));
    playChannel(document.querySelector("[data-fit]"));
}
