(() => {
  class KeyAuth {
    constructor(options = {}) {
      this.name = options.name;
      this.ownerid = options.ownerid;
      this.version = options.version;
      this.url = options.url || "https://keyauth.win/api/1.3/";
      this.sessionid = "";
      this.initialized = false;

      if (!this.name || !this.ownerid || !this.version) {
        throw new Error("KeyAuth: name, ownerid, and version are required");
      }
    }

    async init() {
      if (this.initialized && this.sessionid) return;
      const response = await this._request({
        type: "init",
        name: this.name,
        ownerid: this.ownerid,
        version: this.version,
        hash: ""
      });

      if (response === "KeyAuth_Invalid") {
        throw new Error("KeyAuth app does not exist");
      }
      if (!response || response.success === false) {
        throw new Error((response && response.message) || "KeyAuth init failed");
      }
      this.sessionid = response.sessionid || "";
      this.initialized = true;
    }

    async login(username, password, code = "") {
      if (!this.initialized || !this.sessionid) {
        throw new Error("KeyAuth not initialized");
      }
      const response = await this._request({
        type: "login",
        name: this.name,
        ownerid: this.ownerid,
        sessionid: this.sessionid,
        username,
        pass: password,
        hwid: this._getBrowserHwid(),
        ...(code ? { code } : {})
      });

      if (!response || response.success !== true) {
        throw new Error((response && response.message) || "Invalid credentials");
      }
      this.user_data = response.info || null;
      return response;
    }

    _getBrowserHwid() {
      const seed = [
        navigator.userAgent || "",
        navigator.platform || "",
        navigator.language || ""
      ].join("|");
      // FNV-1a 64-bit style hash -> always >= 20 chars after prefix.
      let hash = 0xcbf29ce484222325n;
      const prime = 0x100000001b3n;
      for (let i = 0; i < seed.length; i += 1) {
        hash ^= BigInt(seed.charCodeAt(i));
        hash = (hash * prime) & 0xffffffffffffffffn;
      }
      const hex = hash.toString(16).padStart(16, "0");
      return `web-${hex}-client`; // length 27
    }

    async _request(data) {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString()
      });
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`KeyAuth HTTP ${res.status}: ${raw.slice(0, 120)}`);
      }
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(`Invalid KeyAuth response: ${raw.slice(0, 120)}`);
      }
    }
  }

  window.KeyAuth = KeyAuth;
})();
