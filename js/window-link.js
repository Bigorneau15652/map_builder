// Widget side of the separate map window: opens it, keeps it up to date and listens to it.
// Messages travel only between two pages of this same site, and only from the window we opened.
(function () {
  const POLL_MS = 1000;

  class WindowLink {
    // spec: { page, name, width, height } of the window. getState(): the full state to send.
    // handlers: onSelect(id), onConfig(patch), onClosed().
    constructor(spec, getState, handlers) {
      this.url = new URL(`${spec.page}?v=0.1.0`, location.href).href;
      this.name = spec.name;
      this.size = { width: spec.width, height: spec.height };
      this.getState = getState;
      this.handlers = handlers;
      this.win = null;
      this.timer = null;
      window.addEventListener(`message`, (event) => this._onMessage(event));
    }

    get isOpen() {
      return Boolean(this.win) && !this.win.closed;
    }

    // Opens the window, or brings it to the front when it is already open.
    // Returns false when the browser blocks it.
    open() {
      if (this.isOpen) {
        this.win.focus();
        return true;
      }
      const width = Math.min(this.size.width, Math.max(400, screen.availWidth - 100));
      const height = Math.min(this.size.height, Math.max(400, screen.availHeight - 100));
      // The link between the window and the widget is kept on purpose: Grist runs widgets in a
      // sandboxed frame, which may only talk to windows it opened itself.
      const opened = window.open(this.url, this.name, `popup=yes,width=${width},height=${height},resizable=yes`);
      if (!opened) return false;
      this.win = opened;
      clearInterval(this.timer);
      this.timer = setInterval(() => { if (!this.isOpen) this._closed(); }, POLL_MS);
      return true;
    }

    close() {
      clearInterval(this.timer);
      if (this.isOpen) this.win.close();
      this.win = null;
    }

    send(type, payload) {
      if (!this.isOpen) return;
      this.win.postMessage({ type, payload }, location.origin);
    }

    _closed() {
      clearInterval(this.timer);
      this.win = null;
      this.handlers.onClosed();
    }

    _onMessage(event) {
      if (!this.win || event.source !== this.win || event.origin !== location.origin || !event.data) return;
      const { type } = event.data;
      const payload = event.data.payload || {};
      if (type === `mapbuilder:window-ready`) this.send(`mapbuilder:state`, this.getState());
      else if (type === `mapbuilder:select`) this.handlers.onSelect && this.handlers.onSelect(payload.id);
      else if (type === `mapbuilder:config`) this.handlers.onConfig(payload.patch);
      else if (type === `mapbuilder:preview`) this.handlers.onPreview && this.handlers.onPreview(payload.draft);
      else if (type === `mapbuilder:dock` || type === `mapbuilder:closed`) this._closed();
    }
  }

  window.WindowLink = WindowLink;
})();
