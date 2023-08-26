# mpv-time-picker

Simple UI to use mpv as a timestamp picker for scripts.

## Usage

### Bindings

By default, `mtp:add` is bound to `g`, `mtp:remove` to `shift+g`, and `mtp:clear` is unbound.

To trigger an action with your timstamps, you will need to run a Command.

### Commands

Commands are sent using script messages.

You can bind these in `input.conf`.

### `mtp:run-command <command> [flags...]`

Runs a shell command with the current file path followed by all timestamps as arguments.
The stdout will be shown in mpv.

### `mtp:run-script <path> [flags...]`

Loads a `.js` or `.lua` script directly into mpv.
The script will receive a `mtp:script-handler` script message containing a serialized JSON array of all timestamps.
Since the script is loaded on each `mtp:run-script` it is required to `exit()` within the script to not leak memory.

### `mtp:send-message <name> [flags...]`

Send an mpv script message by the given name with a serialized JSON array of all timestamps as argument.

### Command flags

- `+clear`: Clear timestamps after executing script/command.

### Examples

See the `example` directory.

## Building

Install TypeScript and run `make`.

## Installing

Run `make install` or manually throw the `mpv-time-picker.js` file into `~/.config/mpv/scripts/`.
