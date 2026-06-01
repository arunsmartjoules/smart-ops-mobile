// Automatic manual mock for @react-native-community/netinfo (used by Jest for all tests).
// The real module starts an internet-reachability poller on import, which crashes in the
// node test environment. This mock provides a quiet, online-by-default stub.
const defaultState = {
  type: "wifi",
  isConnected: true,
  isInternetReachable: true,
  details: {},
};

const NetInfo = {
  configure: jest.fn(),
  fetch: jest.fn(() => Promise.resolve({ ...defaultState })),
  refresh: jest.fn(() => Promise.resolve({ ...defaultState })),
  addEventListener: jest.fn(() => jest.fn()), // returns an unsubscribe fn
  useNetInfo: jest.fn(() => ({ ...defaultState })),
};

module.exports = NetInfo;
module.exports.default = NetInfo;
module.exports.useNetInfo = NetInfo.useNetInfo;
