const TIME_REGEX = /(\d{1,2}):(\d{2}:\d{2})[,.](\d{3})/g;

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
      let nextIdx = i + 1;
      while (nextIdx < lines.length && !lines[nextIdx].trim()) {
        nextIdx += 1;
      }
      if (nextIdx < lines.length && lines[nextIdx].includes("-->")) {
        // Skip numeric cue index before timestamp
        continue;
      }
    }
    cleaned.push(
      line.replace(TIME_REGEX, (_match, hours, rest, ms) => `${hours.padStart(2, "0")}:${rest}.${ms}`)
    );
  }

  return `WEBVTT\n\n${cleaned.join("\n")}`;
}
