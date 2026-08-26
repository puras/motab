const NAME = "";

function greetingFor(hour) {
  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 13) return "中午好";
  if (hour >= 13 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";
  return "夜深了";
}

function pad2(n) { return n.toString().padStart(2, "0"); }

function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function formatDate(d) {
  return d.toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric", weekday: "long"
  });
}

function composeGreeting(hour) {
  const g = greetingFor(hour);
  return NAME ? `${g}，${NAME}` : g;
}

function render() {
  const now = new Date();
  document.getElementById("time").textContent = formatTime(now);
  document.getElementById("date").textContent = formatDate(now);
  document.getElementById("greeting").textContent = composeGreeting(now.getHours());
}

render();
setInterval(render, 1000);