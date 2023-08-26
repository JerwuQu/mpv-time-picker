declare const mp: any;
declare const exit: any;

const fatEscape = (str: string): string => str.replace(/([^\w])/gm, '\\\\\\$1');
const fnClean = (str: string): string => str.replace(/[^\w]/gm, '_');

function secsToStr(secs: number) {
  const date = new Date(0);
  date.setSeconds(secs);
  return date.toISOString().substring(11, 19) + (secs % 1).toPrecision(2).substring(1);
}

function flat<T>(arr: T[][]): T[] {
  return [].concat.apply([], arr);
}

// Bound as: ctrl+g script-message mtp:send-message mtp-clip:run
mp.register_script_message('mtp-clip:run', function (json: string) {
  const timestamps: number[] = JSON.parse(json);
  mp.msg.info(json);
  if (timestamps.length != 2) {
    mp.osd_message('mtp-clip expects 2 time points');
    return;
  }
  const [startTime, endTime] = timestamps;

  const OPT = {
    vflags: '-c:v libx264 -crf 23',
    aflags: '-ac 2 -c:a libopus -b:a 128k',
    outdir: '',
  };
  mp.options.read_options(OPT, 'mtpclip');

  const mediaTitle = mp.get_property('media-title');
  const outName = `${fnClean(mediaTitle)}_${secsToStr(startTime)}-${secsToStr(endTime)}.mp4`;
  const outPath = OPT.outdir ? mp.utils.join_path(OPT.outdir, outName) : outName;

  const mediaPath = mp.get_property('path');
  const mpvTracks: any[] = mp.get_property_native('track-list');
  const trackStreams = mpvTracks
    .filter((t) => t.selected)
    .map((t) => ({
      type: t.type,
      path: t.external ? t['external-filename'] : mediaPath,
      id: t['id'] - 1,
      stream: t['ff-index'],
    }));
  const vTrack = trackStreams.filter((t) => t.type === 'video')[0];
  const aTrack = trackStreams.filter((t) => t.type === 'audio')[0];
  const avTracks = [vTrack, aTrack].filter((t) => !!t);
  const sTrack = trackStreams.filter((t) => t.type === 'sub')[0];

  const args = ['ffmpeg', '-loglevel', 'warning']
    .concat(flat(avTracks.map((t) => ['-ss', startTime + 's', '-to', endTime + 's', '-copyts', '-i', t.path])))
    .concat(flat(avTracks.map((t, i) => ['-map', `${i}:${t.stream}`])))
    .concat(vTrack ? OPT.vflags.split(' ') : [])
    .concat(aTrack ? OPT.aflags.split(' ') : [])
    .concat(sTrack ? ['-vf', `subtitles=filename=${fatEscape(sTrack.path)}:si=${sTrack.id}`] : [])
    .concat(['-ss', startTime + 's'])
    .concat(['-y', outPath]);

  mp.osd_message('mtp-clip encoding...', 3);
  mp.msg.info(JSON.stringify(args));
  mp.command_native_async(
    {
      name: 'subprocess',
      args: args,
      playback_only: false,
      capture_stdout: true,
      capture_stderr: true,
    },
    (_success, result) => {
      if (result.error_string || result.status != 0) {
        mp.osd_message('mtp-clip encoding error! see console', 3);
        mp.msg.error(JSON.stringify(result));
      } else {
        mp.osd_message('mtp-clip encoding done!', 3);
        mp.msg.info(JSON.stringify(result));
      }
    },
  );
});
