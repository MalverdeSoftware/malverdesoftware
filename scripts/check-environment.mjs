const major = Number(process.versions.node.split(".")[0]);
if (major !== 24) {
  console.error(
    `MalverdeSoftware uses Node 24 (tested with 24.19.0); found ${process.version}. Select Node 24 in your IDE or version manager.`,
  );
  process.exit(1);
}
console.log(`Node ${process.version}; runtime check passed.`);
