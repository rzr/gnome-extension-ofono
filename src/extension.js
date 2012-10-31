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

/* org.ofono.Mdem Interface */
const ModemInterface = <interface name="org.ofono.Modem">
<method name="SetProperty">
    <arg name="name" type="s" direction="in"/>
    <arg name="value" type="v" direction="in"/>
</method>
<signal name="PropertyChanged">
    <arg name="name" type="s"/>
    <arg name="value" type="v"/>
</signal>
</interface>;

const ModemProxy = Gio.DBusProxy.makeProxyWrapper(ModemInterface);

const ModemItem = new Lang.Class({
    Name: 'Modems.ModemItem',

    _init: function(path, properties) {
	this.path = path;
	this.proxy = new ModemProxy(Gio.DBus.system, BUS_NAME, path);

	this.powered	= properties.Powered.deep_unpack();
	this.online	= properties.Online.deep_unpack();
	this.type	= properties.Type.deep_unpack();
	this.status	= _("No SIM");

	if (properties.Name)
	    this.name	= properties.Name.deep_unpack();
	else if (properties.Manufacturer) {
	    this.manufacturer = properties.Manufacturer.deep_unpack();

	    if (properties.Model) {
		this.model = properties.Model.deep_unpack();
		this.name = this.manufacturer + '-' + this.model
	    } else
		this.name = this.manufacturer;
	} else
	    this.name = "Modem";

	this.interfaces = properties.Interfaces.deep_unpack();

	this.prop_sig = this.proxy.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
		if (property == 'Powered')
		    this.set_powered(value.deep_unpack());
		if (property == 'Manufacturer')
		    this.set_manufacturer(value.deep_unpack());
		if (property == 'Model')
		    this.set_model(value.deep_unpack());
		if (property == 'Name')
		    this.set_name(value.deep_unpack());
	}));

    },

    CreateMenuItem: function() {
	/* Create a Menu Item for this modem. */
	this.Item = new PopupMenu.PopupMenuSection();

	this.sw = new PopupMenu.PopupSwitchMenuItem(null, this.powered);
	this.sw.label.text = this.name;

	this.sw.connect('toggled',  Lang.bind(this, function(item, state) {
	    let val = GLib.Variant.new('b', state);
	    this.proxy.SetPropertyRemote('Powered', val);
	}));

	this.Item.addMenuItem(this.sw);

	this.status_section = new PopupMenu.PopupBaseMenuItem();

	this.label = new St.Label();
	this.label.text = _("Status:");
	this.status_section.addActor(this.label);

	this.status_label = new St.Label();
	this.status_label.text = this.status;
	this.status_section.addActor(this.status_label, { align: St.Align.END });

	this.Item.addMenuItem(this.status_section);
	return this.Item;
    },

    set_powered: function(powered) {
	this.powered = powered;
	this.sw.setToggleState(powered);
    },

    set_manufacturer: function(manufacturer) {
	this.manufacturer = manufacturer;
	if (this.model)
	    this.name = this.manufacturer + '-' + this.model;
	else
	    this.name = this.manufacturer;

	this.sw.label.text = this.name;
    },

    set_model: function(model) {
	this.model = model;
	if (this.manufacturer)
	    this.name = this.manufacturer + '-' + this.model;
	else
	    this.name = "Modem" + '-' + this.model;
	this.sw.label.text = this.name;
    },

    set_name: function(name) {
	this.name = name;
	this.sw.label.text = this.name;
    },

    UpdateProperties: function(properties) {

    },

    CleanUp: function() {
	if (this.prop_sig)
	    this.proxy.disconnectSignal(this.prop_sig);

	if (this.Item)
	    this.Item.destroy();
    }
});

/* org.ofono.Manager Interface */
const ManagerInterface = <interface name="org.ofono.Manager">
<method name="GetModems">
    <arg name="modems" type="a(oa{sv})" direction="out"/>
</method>
<signal name="ModemAdded">
    <arg name="path" type="o"/>
    <arg name="properties" type="a{sv}"/>
</signal>
<signal name="ModemRemoved">
    <arg name="path" type="o"/>
</signal>
</interface>;

const ManagerProxy = Gio.DBusProxy.makeProxyWrapper(ManagerInterface);

function Manager() {
    return new ManagerProxy(Gio.DBus.system, BUS_NAME, '/');
}

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

	this.manager = new Manager();
	this.modems = {};

	this.manager_sig_modemadd = this.manager.connectSignal('ModemAdded', Lang.bind(this, function(proxy, sender,[path, properties]) {
	    if (Object.getOwnPropertyDescriptor(this.modems, path)) {
		return;
	    }

	    this.modems[path] = {modem: new ModemItem(path, properties), sep: new PopupMenu.PopupSeparatorMenuItem()};
	    this.menu.addMenuItem(this.modems[path].modem.CreateMenuItem());
	    this.menu.addMenuItem(this.modems[path].sep);
	}));

	this.manager_sig_modemrem = this.manager.connectSignal('ModemRemoved', Lang.bind(this, function(proxy, sender, path) {
	    if (!Object.getOwnPropertyDescriptor(this.modems, path)) {
		return;
	    }

	    this.modems[path].modem.CleanUp();
	    this.modems[path].sep.destroy();
	    delete this.modems[path];
	}));

	this.manager.GetModemsRemote(Lang.bind(this, this.get_modems));
    },

    ofonoVanished: function() {
	if (this.modems) {
	    for each (let path in Object.keys(this.modems)) {
		this.modems[path].modem.CleanUp();
		delete this.modems[path];
            }

	    delete this.modems;
	}

	this.setIcon('network-cellular-umts-symbolic');

	if (this._no_ofono)
	    return;

	this._no_ofono = new PopupMenu.PopupMenuSection();
	let no_ofonod = new PopupMenu.PopupMenuItem(_("oFono is not running"),
			{ reactive: false, style_class: 'popup-inactive-menu-item' });

	this._no_ofono.addMenuItem(no_ofonod);
	this.menu.addMenuItem(this._no_ofono);
    },

    get_modems: function(result, excp) {
	/* result contains the exported Modems.
	 * modems is a array: a(oa{sv}), each element consists of [path, Properties]
	*/
	let modem_array = result[0];

	for each (let [path, properties] in modem_array) {
	    if (Object.getOwnPropertyDescriptor(this.modems, path)) {
		this.modems[path].modem.UpdateProperties(properties);
	    } else {
		this.modems[path] = { modem: new ModemItem(path, properties), sep: new PopupMenu.PopupSeparatorMenuItem()};
		this.menu.addMenuItem(this.modems[path].modem.CreateMenuItem());
		this.menu.addMenuItem(this.modems[path].sep);
	    }
	}
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
