const TIME_REGEX = /(\d{2}:\d{2}:\d{2}),(\d{3})/g;

export function convertSrtToVtt(srtText = "") {
  if (typeof srtText !== "string" || !srtText.trim()) {
    return "WEBVTT\n\n";
  }

  const withoutBOM = srtText.replace(/^\uFEFF/, "");
  const lines = withoutBOM.split(/\r?\n/);
  const cleaned = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\d+$/.test(line.trim())) {
      // Skip numeric counters
      continue;
    }
    cleaned.push(line.replace(TIME_REGEX, (_match, time, ms) => `${time}.${ms}`));
  }

  return `WEBVTT\n\n${cleaned.join("\n")}`;
}
