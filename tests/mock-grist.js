// A small replacement of the Grist plugin API, for tests in a plain browser page.
// Tests call window.__grist.load(rows, mapping): the rows then live in window.__table and are
// sent again to the widget after each create, update or destroy, as Grist does.
(function () {
  const handlers = {};
  window.__selected = null;
  window.__table = { rows: [], mapping: null, failWrites: false };

  const send = () => {
    const { rows, mapping } = window.__table;
    return handlers.records && handlers.records(rows.map((row) => ({ ...row })), mapping);
  };
  const guard = () => {
    if (window.__table.failWrites) throw new Error(`Access denied: no write permission`);
  };

  window.grist = {
    ready(options) { window.__ready = options; },
    onOptions(fn) { handlers.options = fn; },
    onRecords(fn) { handlers.records = fn; },
    onRecord(fn) { handlers.record = fn; },
    onNewRecord(fn) { handlers.newRecord = fn; },
    mapColumnNames(rows) { return window.__table.mapping ? rows : null; },
    setOption(name, value) { (window.__options = window.__options || {})[name] = value; },
    setCursorPos(pos) {
      window.__selected = pos.rowId;
      setTimeout(() => handlers.record && handlers.record({ id: pos.rowId }), 0);
      return Promise.resolve();
    },
    selectedTable: {
      getTableId: () => Promise.resolve(`Test`),
      async create({ fields }) {
        guard();
        const rows = window.__table.rows;
        const id = rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
        rows.push({ id, ...fields });
        setTimeout(send, 0);
        return { id };
      },
      async update({ id, fields }) {
        guard();
        Object.assign(window.__table.rows.find((row) => row.id === id), fields);
        setTimeout(send, 0);
      },
      async destroy(id) {
        guard();
        window.__table.rows = window.__table.rows.filter((row) => row.id !== id);
        setTimeout(send, 0);
      }
    },
    docApi: { getDocName: () => Promise.resolve(`Doc`) }
  };
  window.__grist = {
    pushOptions(options) { handlers.options && handlers.options(options || {}); },
    load(rows, mapping) {
      window.__table.rows = rows.map((row) => ({ ...row }));
      window.__table.mapping = mapping;
      return send();
    },
    selectRow(id) { handlers.record && handlers.record({ id }); }
  };
})();
