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
const DIALOG_TIMEOUT = 120*1000;

let _extension = null;

/* UI PIN DIALOG SECTION */
const PinDialog = new Lang.Class({
    Name: 'PinDialog',
    Extends: ModalDialog.ModalDialog,
    _init: function(modem, pin_type, retries) {
	this.parent({ styleClass: 'prompt-dialog' });
	this.modem = modem;
	this.pin_type = pin_type;

	/* Create the main container of the dialog */
	let mainContentBox = new St.BoxLayout({ style_class: 'prompt-dialog-main-layout', vertical: false });
        this.contentLayout.add(mainContentBox,
                               { x_fill: true,
                                 y_fill: true });

	/* Add the dialog password icon */
        let icon = new St.Icon({ icon_name: 'dialog-password-symbolic' });
        mainContentBox.add(icon,
                           { x_fill:  true,
                             y_fill:  false,
                             x_align: St.Align.END,
                             y_align: St.Align.START });

	/* Add a Message to the container */
        this.messageBox = new St.BoxLayout({ style_class: 'prompt-dialog-message-layout',
                                            vertical: true });
        mainContentBox.add(this.messageBox,
                           { y_align: St.Align.START });

	/* Add a Header Label in the Message */
        let subjectLabel = new St.Label({ style_class: 'prompt-dialog-headline',
					  text: "Authentication required to access SIM"});

        this.messageBox.add(subjectLabel,
                       { y_fill:  false,
                         y_align: St.Align.START });

	/* Add a Description Label in the Message */
        this.descriptionLabel = new St.Label({ style_class: 'prompt-dialog-description', text: "" });
        this.messageBox.add(this.descriptionLabel, { y_fill: true, y_align: St.Align.MIDDLE, expand: true });

	/* Set the description lable according to the pin type */
	if (pin_type == "pin")
	    this.descriptionLabel.text = "PIN required to unlock SIM." ;
	else if (pin_type == "puk")
	    this.descriptionLabel.text = "PUK required to unlock PIN";
	else
	    this.descriptionLabel.text = pin_type + "required to access SIM";

	/* Create a box container */
        this.pinBox = new St.BoxLayout({ vertical: false });
	this.messageBox.add(this.pinBox, { y_fill: true, y_align: St.Align.MIDDLE, expand: true });

	/* PIN Label */
        this.pinLabel = new St.Label(({ style_class: 'prompt-dialog-description', text: ""}));
        this.pinBox.add(this.pinLabel,  { y_fill: false, y_align: St.Align.START });

	/* Set the description lable according to the pin type */
	if (pin_type == "pin")
	    this.pinLabel.text = "PIN ";
	else if (pin_type == "puk")
	    this.pinLabel.text = "PUK        ";
	else if (pin_type == "pin2")
	    this.pinLabel.text = "PIN2 ";
	else if (pin_type == "puk2")
	    this.pinLabel.text = "PUK2        ";
	else
	    this.pinLabel.text = pin_type;

	/* PIN Entry */
        this._pinEntry = new St.Entry({ style_class: 'prompt-dialog-password-entry', text: "", can_focus: true });
        ShellEntry.addContextMenu(this._pinEntry, { isPassword: true });

        this.pinBox.add(this._pinEntry, {expand: true, y_align: St.Align.END });
	this._pinEntry.clutter_text.set_password_char('\u25cf');

	this._pinEntry.clutter_text.connect('text-changed', Lang.bind(this, this.UpdateOK));

	/* New PIN Label */
	if (pin_type == 'puk' || pin_type == 'puk2') {
            this.newpinBox = new St.BoxLayout({ vertical: false });
	    this.messageBox.add(this.newpinBox, { y_fill: true, y_align: St.Align.MIDDLE, expand: true });

            this.newpinLabel = new St.Label(({ style_class: 'prompt-dialog-description', text: ""}));
            this.newpinBox.add(this.newpinLabel,  { y_fill: false, y_align: St.Align.START });

	    /* Set the description lable according to the pin type */
	    if (pin_type == "puk")
		this.newpinLabel.text = "New PIN ";
	    else if (pin_type == "puk2")
		this.newpinLabel.text = "New PIN2 ";

	    /* PIN Entry */
            this._newpinEntry = new St.Entry({ style_class: 'prompt-dialog-password-entry', text: "", can_focus: true });
            ShellEntry.addContextMenu(this._newpinEntry, { isPassword: true });

            this.newpinBox.add(this._newpinEntry, {expand: true, y_align: St.Align.END });
	    this._newpinEntry.clutter_text.set_password_char('\u25cf');

	    this._newpinEntry.clutter_text.connect('activate', Lang.bind(this, this.onOk));
	    this._newpinEntry.clutter_text.connect('text-changed', Lang.bind(this, this.UpdateOK));
	}

	/* Add a Retry Label in the Message */
        this.retryLabel = new St.Label({ style_class: 'prompt-dialog-description', text: "" });
        this.messageBox.add(this.retryLabel, { y_fill: true, y_align: St.Align.MIDDLE, expand: true });

	/* Set the description lable according to the pin type */

	if (pin_type == 'pin' || pin_type == 'puk' || pin_type == 'pin2' || pin_type == 'puk2')
	    this.retryLabel.text = retries[pin_type] + " attempts left to Unlock.";

        this.okButton = { label:  _("Unlock"),
                           action: Lang.bind(this, this.onOk),
                           key:    Clutter.KEY_Return,
                         };

        this.setButtons([{ label: _("Cancel"),
                           action: Lang.bind(this, this.onCancel),
                           key:    Clutter.KEY_Escape,
                         },
                         this.okButton]);

	this.timeoutid = Mainloop.timeout_add(DIALOG_TIMEOUT, Lang.bind(this, function() {
	    this.onCancel();
	    return false;
	}));

	this.open();

	this.UpdateOK();

	global.stage.set_key_focus(this._pinEntry);
    },

    onOk: function() {
	this.close();

	Mainloop.source_remove(this.timeoutid);

	if (this.pin_type == 'pin' || this.pin_type == 'pin2') {
	    this.modem.EnterPinRemote(this.pin_type, this._pinEntry.get_text(),  Lang.bind(this, function(result, excp) { 
		this.destroy();
	    }));
	}

	if (this.pin_type == 'puk' || this.pin_type == 'puk2') {
	    this.modem.ResetPinRemote(this.pin_type, this._pinEntry.get_text(), this._newpinEntry.get_text(), Lang.bind(this, function(result, excp) {
		this.destroy();
	    }));
	}
    },

    onCancel: function() {
	this.close();

	Mainloop.source_remove(this.timeoutid);

	this.destroy();
    },

    UpdateOK: function() {
	let enable = false;

	if (this.pin_type == 'pin' || this.pin_type == 'pin2') {
	    let pass = this._pinEntry.get_text();

	    if (pass.length >= 4)
		enable = true;
	    else
		enable = false;
	}

	if (this.pin_type == 'puk' || this.pin_type == 'puk2') {
	    let pass = this._pinEntry.get_text();
	    let newpin = this._newpinEntry.get_text();

	    if (pass.length >= 8 && newpin.length >=4)
		enable = true;
	    else
		enable = false;
	}

	if (enable) {
	    this.okButton.button.reactive = true;
	    this.okButton.button.can_focus = true;
	    this.okButton.button.remove_style_pseudo_class('disabled');
	    this._pinEntry.clutter_text.connect('activate', Lang.bind(this, this.onOk));
	} else {
	    this.okButton.button.reactive = false;
	    this.okButton.button.can_focus = false;
	    this.okButton.button.add_style_pseudo_class('disabled');
	}
    }
});

/* org.ofono.ConnectionManager Interface */
const ConnectionManagerInterface = <interface name="org.ofono.ConnectionManager">
<method name="GetProperties">
    <arg name="properties" type="a{sv}" direction="out"/>
</method>
<signal name="PropertyChanged">
    <arg name="name" type="s"/>
    <arg name="value" type="v"/>
</signal>
</interface>;

const ConnectionManagerProxy = Gio.DBusProxy.makeProxyWrapper(ConnectionManagerInterface);

/* org.ofono.SimManager Interface */
const SimManagerInterface = <interface name="org.ofono.SimManager">
<method name="GetProperties">
    <arg name="properties" type="a{sv}" direction="out"/>
</method>
<method name="SetProperty">
    <arg name="name" type="s" direction="in"/>
    <arg name="value" type="v" direction="in"/>
</method>
<method name="EnterPin">
    <arg name="type" type="s" direction="in"/>
    <arg name="pin" type="s" direction="in"/>
</method>
<method name="ResetPin">
    <arg name="type" type="s" direction="in"/>
    <arg name="puk" type="s" direction="in"/>
    <arg name="newpin" type="s" direction="in"/>
</method>
<signal name="PropertyChanged">
    <arg name="name" type="s"/>
    <arg name="value" type="v"/>
</signal>
</interface>;

const SimManagerProxy = Gio.DBusProxy.makeProxyWrapper(SimManagerInterface);

/* org.ofono.Modem Interface */
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

	this.powered		= properties.Powered.deep_unpack();
	this.online		= properties.Online.deep_unpack();
	this.type		= properties.Type.deep_unpack();
	this.interfaces		= null;
	this.sim_present	= false;
	this.sim_pin		= null;
	this.sim_pin_retry	= null;
	this.status		= _("Disabled");
	this.bearer		= "none";
	this.attached		= false;

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

	this.set_interfaces(properties.Interfaces.deep_unpack());

	this.prop_sig = this.proxy.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
		if (property == 'Powered')
		    this.set_powered(value.deep_unpack());
		if (property == 'Online')
		    this.set_online(value.deep_unpack());
		if (property == 'Manufacturer')
		    this.set_manufacturer(value.deep_unpack());
		if (property == 'Model')
		    this.set_model(value.deep_unpack());
		if (property == 'Name')
		    this.set_name(value.deep_unpack());
		if (property == 'Interfaces')
		    this.set_interfaces(value.deep_unpack());
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

	this.update_status();

	this.Item.connect('activate', Lang.bind(this, this.clicked));

	return this.Item;
    },

    set_powered: function(powered) {
	this.powered = powered;
	this.sw.setToggleState(powered);
	this.update_status();
    },

    set_online: function(online) {
	this.online = online;
	this.update_status();
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

    set_interfaces: function(interfaces) {
	this.interfaces = interfaces;

	if (this.interfaces.indexOf('org.ofono.SimManager') != -1) {

	    this.sim_manager = new SimManagerProxy(Gio.DBus.system, BUS_NAME, this.path);

	    this.sim_manager.GetPropertiesRemote(Lang.bind(this, function(result, excp) {
		/* result contains the exported Properties.
		 * properties is a dict a{sv}. They can be accessed by
		 * properties.<Property Name>.deep_unpack() which unpacks the variant.
		 */
		let properties = result[0];

		if (properties.Present)
		    this.sim_present	= properties.Present.deep_unpack();
		else
		    this.sim_present	= null;

		if (properties.PinRequired)
		    this.sim_pin	= properties.PinRequired.deep_unpack();
		else
		    this.sim_pin	= null;

		if (properties.Retries)
		    this.sim_pin_retry	= properties.Retries.deep_unpack();
		else
		    this.sim_pin_retry	= null;

		this.dialog		= null;

		this.update_status();
		this.enter_pin();
	    }));

	    this.sim_prop_sig = this.sim_manager.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
		if (property == 'Present')
		    this.set_sim_present(value.deep_unpack());
		if (property == 'PinRequired')
		    this.set_sim_pinrequired(value.deep_unpack());
		if (property == 'Retries')
		    this.set_sim_pin_retries(value.deep_unpack());
	    }));
	}

	if (this.interfaces.indexOf('org.ofono.ConnectionManager') != -1) {

	    this.connection_manager = new ConnectionManagerProxy(Gio.DBus.system, BUS_NAME, this.path);

	    this.connection_manager.GetPropertiesRemote(Lang.bind(this, function(result, excp) {
		/* result contains the exported Properties.
		 * properties is a dict a{sv}. They can be accessed by
		 * properties.<Property Name>.deep_unpack() which unpacks the variant.
		 */
		let properties = result[0];

		if (properties.Attached)
		    this.set_attached(properties.Attached.deep_unpack());

		if (properties.Bearer)
		    this.set_bearer(properties.Bearer.deep_unpack());
	    }));

	    this.sim_prop_sig = this.connection_manager.connectSignal('PropertyChanged', Lang.bind(this, function(proxy, sender,[property, value]) {
		if (property == 'Attached')
		    this.set_attached(value.deep_unpack());
		if (property == 'Bearer')
		    this.set_bearer(value.deep_unpack());
	    }));
	}

    },

    set_sim_present: function(present) {
	this.sim_present = present;
	this.update_status();
    },

    set_sim_pinrequired: function(pinrequired) {
	this.sim_pin = pinrequired;
	this.update_status();
	this.enter_pin();
    },

    set_sim_pin_retries: function(retries) {
	this.sim_pin_retry = retries;
	this.enter_pin();
    },

    enter_pin: function() {
	if (this.sim_pin == null || this.sim_pin_retry == null)
	    return;

	if (this.sim_pin == 'none')
	    return;

	if (this.sim_pin_retry[this.sim_pin] > 0)
	    this.dialog = new PinDialog(this.sim_manager, this.sim_pin, this.sim_pin_retry);
    },

    update_status: function() {
	if (this.powered == false) {
	    this.status = _("Disabled");
	    _extension.setIcon('network-cellular-umts-symbolic');
	}else {
	    if (this.sim_present == false) {
		this.status = _("No SIM");
		_extension.setIcon('network-cellular-umts-symbolic');
	    } else {
		if (this.sim_pin && this.sim_pin != "none") {
		    if (this.sim_pin == "pin")
			this.status = _("PIN Required");
		    else if (this.sim_pin == "puk")
			this.status = _("PUK Required");
		    else
			this.status = this.sim_pin +_("Required");
		    _extension.setIcon('dialog-password-symbolic');
		} else {
		    _extension.setIcon('network-cellular-gprs-symbolic');
		    if (this.attached == true)
			this.status = _("Available");
		    else
			this.status = _("SIM Ready");
		}
	    }
	}

	if (this.status_label)
	    this.status_label.text = this.status;
    },

    set_attached: function(attached) {
	this.attached = attached;
	this.update_status();
    },

    set_bearer: function(bearer) {
	this.bearer = bearer;
    },

    clicked: function() {
	if (this.sim_pin && this.sim_pin == "none")
	    return;

	if (this.sim_manager && this.sim_pin && (this.sim_pin_retry[this.sim_pin] >= 0))
	    this.dialog = new PinDialog(this.sim_manager, this.sim_pin, this.sim_pin_retry);
    },

    UpdateProperties: function(properties) {

    },

    CleanUp: function() {
	if (this.prop_sig)
	    this.proxy.disconnectSignal(this.prop_sig);

	if (this.sim_prop_sig)
	    this.sim_manager.disconnectSignal(this.sim_prop_sig);

	if (this.Item)
	    this.Item.destroy();

	if (this.dialog)
	    this.dialog.destroy();

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

	    this.no_modems(false);

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


	    let mod_list = Object.getOwnPropertyNames(this.modems)
	    if (mod_list.length == 0) {
		this.no_modems(true);
	    }
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

	this.no_modems(false);

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

	if (modem_array.length == 0) {
	    this.no_modems(true);
	} else
	    this.no_modems(false);

	for each (let [path, properties] in modem_array) {
	    if (Object.getOwnPropertyDescriptor(this.modems, path)) {
		this.modems[path].modem.UpdateProperties(properties);
	    } else {
		this.modems[path] = { modem: new ModemItem(path, properties), sep: new PopupMenu.PopupSeparatorMenuItem()};
		this.menu.addMenuItem(this.modems[path].modem.CreateMenuItem());
		this.menu.addMenuItem(this.modems[path].sep);
	    }
	}
    },

    no_modems: function(add) {
	if (add) {
	    this.no_modems_item = new PopupMenu.PopupMenuSection();
	    let no_modem_label = new PopupMenu.PopupMenuItem(_("No Modems detected"),
				{ reactive: false, style_class: 'popup-inactive-menu-item' });

	    this.no_modems_item.addMenuItem(no_modem_label);
	    this.menu.addMenuItem(this.no_modems_item);

	    _extension.setIcon('network-cellular-umts-symbolic');
	} else {
	    if (this.no_modems_item) {
		this.no_modems_item.destroy();
		this.no_modems_item = null;
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
