// Metro asset imports — a require()/import of an asset resolves to a numeric
// asset registry ID at runtime (see loadTensorflowModel's ModelSource).
declare module '*.tflite' {
  const source: number;
  export default source;
}
