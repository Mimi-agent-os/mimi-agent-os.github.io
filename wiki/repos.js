// The repos the wiki reads, in sidebar order; `what` is the one line the home page shows (markdown).
export const org = "Mimi-agent-os";
export const branch = "main";

export const repos = [
    { name: "launch", what: "`mimi-launch`: sets up a workspace for a server or agent developer" },
    { name: "protocol", what: "wire vocabulary and the secure channel core" },
    { name: "sdk", what: "`@mimi-os/sdk`, the agent runtime" },
    { name: "plugins", what: "`@mimi-os/plugins`: memory, wiki and cron packs" },
    { name: "gateway", what: "the daemon and the `mimi` CLI" },
    { name: "devkit", what: "`mimi-dev`: test an agent against a real gateway" },
    { name: "app", what: "the desktop and Android client" },
];
