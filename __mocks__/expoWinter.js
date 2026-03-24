// Stub for expo/src/winter and expo/src/winter/runtime.native
// Prevents jest-runtime "outside of test scope" error (jest 30 + jest-expo 55 + expo 54).
// The lazy __ExpoImportMetaRegistry getter installed by installGlobal fires during
// module resolution outside isInsideTestCode, causing jest 30 to throw.
// By stubbing the whole winter module we prevent the getter from being installed.
module.exports = {};
