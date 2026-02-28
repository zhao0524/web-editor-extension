const headings = document.querySelectorAll("h1");
let count = 0;

headings.forEach((h1) => {
  h1.textContent = "Hello World";
  count++;
});

alert(
  count > 0
    ? `Done — changed ${count} H1 heading${count > 1 ? "s" : ""} to "Hello World".`
    : "No H1 headings found on this page."
);
