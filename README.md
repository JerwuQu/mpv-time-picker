# mpv-time-picker

Simple UI to use mpv as a timestamp picker for scripts.

## Usage

By default, you can use `alt+t` to add a timestamp and `alt+shift+t` to remove one.

To trigger a script, you can bind a hotkey in `input.conf`.

You can either run processes, which will get the filename followed by all the timestamps as arguments:

`ctrl+alt+t script-message mtp:run ~~/do-something-cool.sh`

Or if it's a `.js` or `.lua` file, it will be loaded directly into mpv, and receive a `mtp:script:run` script message:

`ctrl+alt+t script-message mtp:run ~~/do-something-cool.js keep`

The `keep` is an optional flag which says to keep the timestamps after running the file, otherwise they will be cleared.

### Minimal JS script example

```js
mp.register_script_message('mtp:script:run', function(obj) {
	mp.msg.info('mtp:script:run ' + obj); // obj is a json object containing `path` and `times`
	exit(); // required to properly kill the script (since they are single-use)
});
```

## Building

Install TypeScript and run `make`.

## Installing

Throw the `mpv-time-picker.js` file into `~/.config/mpv/scripts/`.
`make install` does this too.
