export const state = {
  data: null,
  filters: {
    ticker: 'ALL',
    type: 'ALL',
    minDelta: -1.0,
    maxDelta: 1.0
  },
  listeners: [],

  setData(newData) {
    this.data = newData;
    this.notify();
  },

  setFilter(key, value) {
    this.filters[key] = value;
    this.notify();
  },

  subscribe(callback) {
    this.listeners.push(callback);
  },

  notify() {
    this.listeners.forEach(cb => cb(this.data, this.filters));
  }
};
