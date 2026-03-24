// Stub for expo/src/winter/ImportMetaRegistry
// Prevents jest-runtime "outside of test scope" error when the lazy getter
// installed by expo/src/winter fires during module resolution in jest 30.
module.exports = {
  ImportMetaRegistry: { url: null },
};
