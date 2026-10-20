// A small replacement of the Grist plugin API, for tests in a plain browser page.
// Tests set window.__rows, window.__mapping and then call window.__grist.pushRecords().
(function () {
  const handlers = {};
  window.__selected = null;
  window.grist = {
    ready(options) { window.__ready = options; },
    onOptions(fn) { handlers.options = fn; },
    onRecords(fn) { handlers.records = fn; },
    onRecord(fn) { handlers.record = fn; },
    onNewRecord(fn) { handlers.newRecord = fn; },
    mapColumnNames(rows) { return window.__mapping ? rows : null; },
    setOption(name, value) { (window.__options = window.__options || {})[name] = value; },
    setCursorPos(pos) { window.__selected = pos.rowId; return Promise.resolve(); },
    selectedTable: { getTableId: () => Promise.resolve(`Test`) },
    docApi: { getDocName: () => Promise.resolve(`Doc`) }
  };
  window.__grist = {
    pushOptions(options) { handlers.options && handlers.options(options || {}); },
    pushRecords(rows, mapping) {
      window.__mapping = mapping;
      return handlers.records && handlers.records(rows, mapping);
    },
    selectRow(id) { handlers.record && handlers.record({ id }); }
  };
})();
