.PHONY: all
all: mpv-time-picker.js scripts/mtp-clip.js

%.js: %.ts
	tsc $^ --outFile $@

.PHONY: install-all install-script install-clip
install-all: install-script install-clip
install-script: mpv-time-picker.js
	cp $^ ~/.config/mpv/scripts/
install-clip: scripts/mtp-clip.js
	cp $^ ~/.config/mpv/scripts/

.PHONY: clean
clean:
	rm -f mpv-time-picker.js scripts/*.js
