# Change these to modify how installation is performed
topextensiondir = $(datadir)/gnome-shell/extensions
extensiondir = $(topextensiondir)/$(uuid)
uuid = gnome-extension-ofono

dist_extension_DATA = extension.js
nodist_extension_DATA = metadata.json $(EXTRA_EXTENSION)

EXTRA_DIST = metadata.json.in

metadata.json: metadata.json.in $(top_builddir)/config.status
	$(AM_V_GEN) sed -e "s|[@]LOCALEDIR@|$(datadir)/locale|" \
	-e "s|[@]uuid@|$(uuid)|" $< > $@

CLEANFILES = metadata.json
