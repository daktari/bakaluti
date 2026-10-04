/**
 * Square cover art for a recorded track, drawn on a canvas in the house
 * style: blueprint grid, the title in acid, the code that makes the sound.
 */
export async function coverPng(opts: {
  title: string;
  channel: string;
  bpm: number;
  code: string;
}): Promise<Blob> {
  const size = 1400;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#060606";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(200,255,0,0.07)";
  ctx.lineWidth = 2;
  for (let x = 0; x <= size; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, x);
    ctx.lineTo(size, x);
    ctx.stroke();
  }
  const mono = '"SF Mono", "Fira Code", "JetBrains Mono", Menlo, monospace';

  ctx.fillStyle = "#8a8a8a";
  ctx.font = `600 34px ${mono}`;
  ctx.fillText("[BAKA", 90, 130);
  const w = ctx.measureText("[BAKA").width;
  ctx.fillStyle = "#c8ff00";
  ctx.fillText("BAKA", 90 + ctx.measureText("[").width, 130);
  ctx.fillStyle = "#ff3ea5";
  ctx.fillText("LUTI", 90 + w, 130);
  ctx.fillStyle = "#8a8a8a";
  ctx.fillText(" FM]", 90 + w + ctx.measureText("LUTI").width, 130);

  ctx.fillStyle = "#ff3ea5";
  ctx.font = `600 30px ${mono}`;
  ctx.fillText(`${opts.channel.toUpperCase()}  ·  ${opts.bpm} BPM`, 90, 210);

  // title, wrapped, in LED acid
  ctx.fillStyle = "#c8ff00";
  ctx.shadowColor = "rgba(200,255,0,0.55)";
  ctx.shadowBlur = 24;
  ctx.font = `700 118px ${mono}`;
  const words = opts.title.toUpperCase().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > size - 180 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((text, i) => ctx.fillText(text, 90, 380 + i * 140));
  ctx.shadowBlur = 0;

  // the code
  ctx.fillStyle = "#d6d6d6";
  ctx.font = `400 26px ${mono}`;
  const codeTop = 380 + Math.min(lines.length, 3) * 140 + 40;
  opts.code
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("--"))
    .slice(0, 9)
    .forEach((l, i) => {
      const body = l.split("--")[0].trim();
      const cut = body.length > 78 ? body.slice(0, 75) + "…" : body;
      ctx.fillStyle = i % 2 ? "#9ab300" : "#d6d6d6";
      ctx.fillText(cut, 90, codeTop + i * 42);
    });

  ctx.fillStyle = "#8a8a8a";
  ctx.font = `500 30px ${mono}`;
  ctx.fillText("código abierto · remézclalo en bakaluti.com", 90, size - 90);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? new Blob()), "image/png")
  );
}
