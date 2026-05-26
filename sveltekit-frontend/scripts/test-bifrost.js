async function test() {
  try {
    const res = await fetch('http://127.0.0.1:3040/v1/models');
    const data = await res.json();
    console.log("Bifrost Models:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
