PROJ=mpv-time-picker

$(PROJ).js: $(PROJ).ts
	tsc

.PHONY: install clean
install: $(PROJ).js
	cp $^ ~/.config/mpv/scripts/

clean:
	rm -f $(PROJ).js
