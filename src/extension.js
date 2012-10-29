 /*
  * Copyright (C) 2011 Intel Corporation. All rights reserved.
  * Author: Alok Barsode <alok.barsode@intel.com>
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 2 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>.
  */

const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Main = imports.ui.main;
const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const PopupMenu = imports.ui.popupMenu;
const PanelMenu = imports.ui.panelMenu;
const Gettext = imports.gettext;
const Clutter = imports.gi.Clutter;
const DBus = imports.dbus;
const ModalDialog = imports.ui.modalDialog;
const ShellEntry = imports.ui.shellEntry;
const MessageTray = imports.ui.messageTray;
const CheckBox = imports.ui.checkBox;
const _ = Gettext.gettext;

const BUS_NAME = 'org.ofono';

let _extension = null;

const ofonoManager = new Lang.Class({
    Name: 'ofonoManager',
    Extends: PanelMenu.SystemStatusButton,
    run: false,
    _menuopen: false,

    _init: function() {
	this.parent('network-cellular-umts-symbolic', _("ofono"));
	this.ofonoVanished();
	this.watch = Gio.DBus.system.watch_name(BUS_NAME, Gio.BusNameWatcherFlags.NONE,
						Lang.bind(this, this.ofonoAppeared),
						Lang.bind(this, this.ofonoVanished) );
    },

    ofonoAppeared: function() {
	if (this._no_ofono) {
	    this._no_ofono.destroy();
	    this._no_ofono = null;
	}
    },

    ofonoVanished: function() {
	this.setIcon('network-cellular-umts-symbolic');

	if (this._no_ofono)
	    return;

	this._no_ofono = new PopupMenu.PopupMenuSection();
	let no_ofonod = new PopupMenu.PopupMenuItem(_("oFono is not running"),
			{ reactive: false, style_class: 'popup-inactive-menu-item' });

	this._no_ofono.addMenuItem(no_ofonod);
	this.menu.addMenuItem(this._no_ofono);
    }
})

function init() {
    //Nothing to do here.
}

function enable() {
    _extension = new ofonoManager();
    Main.panel.addToStatusArea('oFono', _extension);
}

function disable() {
    Gio.DBus.system.unwatch_name(_extension.watch);
    _extension.destroy();

    _extension = null;
}
