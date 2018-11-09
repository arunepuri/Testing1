define([
    'dojo/_base/declare',
    'esri/request',
    'dojo/promise/all',
    'dojo/_base/lang',
    'dojo/_base/array',
    'dojo/_base/html',
    'dojo/json',
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidget',
    'jimu/portalUtils',
    'dojo/on',
    'dojo/string',
    'esri/SpatialReference',
    'esri/geometry/Extent',
    'esri/graphic',
    'esri/layers/GraphicsLayer',
    './MapStateManager',
    'jimu/LayerInfos/LayerInfos',
    'jimu/utils',
    'dojo/request/xhr',
    'libs/storejs/store',
    'dijit/popup',
    'dijit/TooltipDialog',
    'dojox/string/Builder',
    'dojo/dom',
    'dojo/query',
    'esri/layers/ArcGISTiledMapServiceLayer',
    'esri/dijit/BasemapLayer',
    'esri/layers/ArcGISDynamicMapServiceLayer',
    'esri/layers/WMSLayer',
    'esri/layers/ArcGISImageServiceLayer',
    'esri/layers/FeatureLayer',
    './PortalHandler',
    'esri/arcgis/Portal',
    'dojo/dom-construct',
    'esri/tasks/PrintTask',
    'esri/tasks/PrintParameters',
    'esri/tasks/PrintTemplate',
    'esri/tasks/Geoprocessor',
    'dojox/form/CheckedMultiSelect',
    'dojo/data/ObjectStore',
    'dijit/form/FilteringSelect',
    'dojo/parser',
    'dijit/form/Button',
    'jimu/dijit/TabContainer3',
    'dojo/dom-style',
    './Common',
    'dijit/form/ComboBox',
    'dijit/form/SimpleTextarea',
    'dijit/ConfirmDialog',
    'dojo/store/Memory',
    'jimu/dijit/LoadingShelter'
],
    function (declare, esriRequest, all, lang, array, html, json, _WidgetsInTemplateMixin, BaseWidget, portalUtils,
        on, string, SpatialReference, Extent, Graphic, GraphicsLayer, MapStateManager,
        LayerInfos, utils, xhr, store, popup, TooltipDialog, Builder, dom, query,
        ArcGISTiledMapServiceLayer, BasemapLayer, ArcGISDynamicMapServiceLayer, WMSLayer,
        ArcGISImageServiceLayer, FeatureLayer, portalHandler, arcgisPortal, domConstruct,
        PrintTask, PrintParameters, PrintTemplate, Geoprocessor, CheckedMultiSelect,
        DataStore, FilteringSelect, parser, Button, TabContainer, domStyle, Common, ComboBox, SimpleTextarea,
        ConfirmDialog, Memory) {
        return declare([BaseWidget, _WidgetsInTemplateMixin], {
            //these two properties is defined in the BaseWidget
            baseClass: 'jimu-widget-mapstate',
            name: 'Mapstate',

            //all of the map states, the format is the same as the config.json
            mapstates: [],

            _mapStateJsonRemote: {},
            _comboBoxMaxCharacters: '35',
            _operation: null,

            _advancedSetting: null,
            _advancedSettingContent: null,

            _geoprocessor: null,

            _printTask: null,
            _printTaskParams: null,
            _thumbnailHeight: 100,
            _thumbnailWidth: 100,
            _thumbnailDpi: 96,
            _thumbnailFormat: 'PNG32',
            _templateLayout: 'MAP_ONLY',
            _preserveScale: false,
            _showAttribution: false,

            _loadDialogContent: null,
            _loadDialog: null,
            _saveDialogContent: null,
            _saveDialog: null,

            _portal: null,
            _groupsSharedTo: [],
            _individualsSharedTo: [],
            _accessibleGroups: [],
            _individualsAll: [],
            _groupAll: [], //***

            _currentSortBy: "",
            _filterText: "",
            _currentSortOrder: "descending",
            _filterAndSortApplied: true,
            // the html object of the apply button
            _applyButton: null,

            // the separator for config name and owner
            KEY_SEPARATOR: "-_-",


            //use this flag to control populating shareTo groups
            _isGroupsPopulated: false,
            //use this flag to control populating shareTo individuals
            _isIndivPopulated: false,
            //use this flag to control refreshing config thumbnail strip
            _isDeleted: false,
            //use this flag to control save status message for first-time load
            _isFirstLoaded: false,

            constructor: function (options) {
                this.map = options.map;
                if (this.map.itemInfo && this.map.itemInfo.item)
                    this.mapName = options.map.itemInfo.item.title;
                else
                    this.mapName = 'this webmap';

                this.exportWebMapUrl = options.config.exportWebMapUrl;
                this.gpServiceUrl = options.config.gpServiceUrl;

                this.advanceThumbnailImageUrl = options.config.thumbnailImagePathUrl; //***
                this.sortByOptions = options.config.sortByOptions;
                if (!Array.isArray(this.sortByOptions)) {
                    this.sortByOptions = options.config.sortByOptions.split(",");
                }

                //this.storeStrategy = 'gpservice';//options.config.storeStrategy;
                //this.storeServiceUrl = options.config.storeServiceUrl;
                this.layerInfosObj = null;

                //for deployment
                this._portalUrl = options.appConfig.portalUrl;
                this._portal = new arcgisPortal.Portal(this._portalUrl);
                if (portalUtils.getPortal(this._portalUrl).user != null) {
                    this.userName = portalUtils.getPortal(this._portalUrl).user.username;
                    //this.token = portalUtils.getPortal(this._portalUrl).user.credential.token;
                    // to populate groups from portal utils
                    array.forEach(portalUtils.getPortal(this._portalUrl).user.groups, lang.hitch(this, function (item) {
                        this._groupAll.push(item.title);
                    }));
                }
                else {
                    this.userName = 'genericuser';
                }

                this.storeKey = this.userName + '_' + this.map.itemId;

                this.MapStateManager = MapStateManager.getInstance(this.storeKey);
            },

            postCreate: function () {
                this.inherited(arguments);
                this._createSaveDialogContent();
                this._createSaveDialog();
                this._initPrintTask();
                this._initGPService();
                this._currentSortBy = this.sortByOptions[0];
            },

            startup: function () {
                this.inherited(arguments);
                this._bindSaveBtnClickEvent();
            },

            onOpen: function () {
                this.shelter.show();
                this.inherited(arguments);
                this._populateIndivShareTo();
                this._populateGroupShareTo();

            },

            _populateIndivShareTo: function () {
                if (!this._isIndivPopulated) {
                    this._isIndivPopulated = true;
                    this.mapstateMsgNode.innerHTML = "Loading......";

                    for (i = 1; i < 10000; i += 100) {
                        portalHandler.getUsers(this._portal, { q: this.nls.portalUserFilter, num: i + 99, start: i }).then(lang.hitch(this, function (result) {
                            this._individualsAll = this._individualsAll.concat(result);
                            /*array.forEach(result, lang.hitch(this, function(item){
                                if(item.value != this.userName)
                                    dijit.byId('indivChkMultiSelect').addOption({'label': item.label, 'value': item.value});
                                	
                            }));*/
                        }));

                    }
                }
            },

            _populateGroupShareTo: function () {
                if (!this._isGroupsPopulated) {

                    array.forEach(this._groupAll, lang.hitch(this, function (item) {
                        dijit.byId('groupChkMultiSelect').addOption({ 'label': item, 'value': item });
                        this._isGroupsPopulated = true;
                    }));
                    this._accessibleGroups = this._groupAll;

                    if (this._isGroupsPopulated || this._isIndivPopulated) {
                        this._retrieveMapState();
                    }
                }
                else {
                    if (this._isGroupsPopulated || this._isIndivPopulated) {
                        this._retrieveMapState();
                    }
                }
            },

            _bindSaveBtnClickEvent: function () {
                this.own(on(dijit.byId('saveBtn'), 'click', lang.hitch(this, function () {
                    this._saveMapState();
                })));
            },

            _createSaveDialog: function () {
                var tooltipDialog = new TooltipDialog({
                    style: 'width: 500px;',
                    content: this._saveDialogContent
                });

                this._saveDialog = tooltipDialog;
            },

            _createCloseImgBtnDivSave: function () {
                var closeImgBtnDiv = domConstruct.create('div');
                domConstruct.place('<img class="closeImgBtn" src="./widgets/AdvancedSave/images/Grey_close.png" alt="Submit" \
                align="right" onclick="dijit.popup.close(this._saveDialog);return false;">', closeImgBtnDiv);

                return closeImgBtnDiv;
            },

            _createConfigComboBox: function () {
                var configComboBox = new ComboBox({
                    id: 'configComboBox',
                    name: 'configuration',
                    value: '',
                    placeHolder: this.nls.configComboBoxDefault,
                    maxlength: this._comboBoxMaxCharacters,
                    searchAttr: 'name',
                    fetchProperties: { sort: [{ attribute: 'name', ascending: true }] },
                    onChange: lang.hitch(this, function (value) {
                        value = value.trim();
                        if (this._retrieveConfigNames().indexOf(value.toLowerCase()) > -1) {
                            this._updateDesptTextarea(value)
                            this._updateAdvancedSetting(value);
                            this._updateShareTo(value);
                        }
                        else {
                            this._resetDesptTextarea();
                            this._resetAdvancedSetting();
                            this._resetShareTo();
                        }
                    })
                });
                configComboBox.set('style', { width: '100%', height: '30px', fontSize: '24px' });
                var configComboBoxDiv = domConstruct.create('div');
                domConstruct.place(configComboBox.domNode, configComboBoxDiv);

                return configComboBoxDiv;
            },

            _createDesptTextarea: function () {
                var desptTextarea = new SimpleTextarea({
                    id: 'configDesptTextarea',
                    placeholder: this.nls.desptTextareaPlaceHolder
                });
                desptTextarea.set('style', { width: '100%', height: '30px'/*, display: 'none'*/ });
                var desptTextareaDiv = domConstruct.create('div');
                domConstruct.place(desptTextarea.domNode, desptTextareaDiv);

                return desptTextareaDiv;
            },

            _createAdvSetting: function () {
                var advSettings = this.nls.advSettingList;
                var halflength = Math.ceil(advSettings.length / 2);

                var advancedSettingDiv = domConstruct.create('div');
                var advancedSettingLabelDiv = domConstruct.toDom('<div class="jimu-widget-mapstatelabel">' + this.nls.advSettingLabel + '</div>');
                var advancedSettingChkDiv = domConstruct.create('div', { id: 'advancedsettingchkdiv' });

                var advancedLeftDiv = domConstruct.create('div', { id: 'advancedleft' });
                var advancedLeft = new Builder('<ul class="jimu-widget-ulpreferences"/>');

                for (i = 0; i < halflength; i++)
                    advancedLeft.append('<li class="jimu-widget-lipreferences"><input type="checkbox" class="jimu-widget-chkpreferences" \
                    id="chk' + advSettings[i] + '" value="' + Common.switchNameLabel(advSettings[i], this.nls.advSettingList, this.nls.advSettingLabels) + '" \
                    checked><label>' + Common.switchNameLabel(advSettings[i], this.nls.advSettingList, this.nls.advSettingLabels) + '</label></li>');

                domConstruct.place(advancedLeft.toString(), advancedLeftDiv);

                var advancedRightDiv = domConstruct.create('div', { id: 'advancedright' });
                var advancedRight = new Builder('<ul class="jimu-widget-ulpreferences"/>');

                for (i = halflength; i < advSettings.length; i++)
                    advancedRight.append('<li class="jimu-widget-lipreferences"><input type="checkbox" class="jimu-widget-chkpreferences" \
                    id="chk' + advSettings[i] + '" value="' + Common.switchNameLabel(advSettings[i], this.nls.advSettingList, this.nls.advSettingLabels) + '" \
                    checked><label>' + Common.switchNameLabel(advSettings[i], this.nls.advSettingList, this.nls.advSettingLabels) + '</label></li>');

                advancedRight.append('<br/>');
                domConstruct.place(advancedRight.toString(), advancedRightDiv);

                domConstruct.place(advancedLeftDiv, advancedSettingChkDiv);
                domConstruct.place(advancedRightDiv, advancedSettingChkDiv);
                domConstruct.place(advancedSettingLabelDiv, advancedSettingDiv);
                domConstruct.place(advancedSettingChkDiv, advancedSettingDiv);

                return advancedSettingDiv;
            },

            _createShareToDiv: function () {
                var shareToDiv = domConstruct.create('div');
                var shareToLabelDiv = domConstruct.toDom('<div class="jimu-widget-mapstatelabel">' + this.nls.shareToLabel + '</div>');

                var shareToContentDiv = domConstruct.create('div');
                var shareToSelectDiv = domConstruct.create('div', { style: { paddingBottom: '10px' } });
                var shareToSelectData = [];

                array.forEach(this._getShareToList(), lang.hitch(this, function (item) {
                    var shareto = {};
                    shareto.name = item;
                    shareto.id = item;
                    shareToSelectData.push(shareto);
                }));

                var shareToStore = new Memory({ data: shareToSelectData });

                var shareToSelect = new FilteringSelect({
                    id: 'shareToSelect',
                    name: 'shareTo',
                    store: shareToStore,
                    value: '', // this.nls.shareToSelectDefault,
                    searchAttr: 'name',
                    //autocomplete: true,
                    placeHolder: 'Share to',
                    onChange: lang.hitch(this, function (value) {
                        if (value === this.nls.shareTo[1])
                            dom.byId('groupIndivDiv').style.display = 'block';
                        else
                            dom.byId('groupIndivDiv').style.display = 'none';
                    })
                });

                shareToSelect.set('style', { width: '100%', height: '30px', fontSize: '24px' });
                domConstruct.place(shareToSelect.domNode, shareToSelectDiv);

                var groupIndivDiv = domConstruct.create('div', { id: 'groupIndivDiv', style: { paddingBottom: '10px' } });
                var groupDiv = domConstruct.create('div', { id: 'groupdiv', style: { paddingBottom: '10px' } });

                var MyGroupCheckedMultiSelect = declare(CheckedMultiSelect, {
                    startup: function () {
                        this.inherited(arguments);
                        setTimeout(lang.hitch(this, function () {
                            this.dropDownButton.set("label", this.label);
                        }));
                    },

                    _updateSelection: function () {
                        this.inherited(arguments);
                        if (this.dropDown && this.dropDownButton) {
                            var labels = [];
                            array.forEach(this.options, function (option) {
                                if (option.selected) {
                                    labels.push(option.label);
                                }
                            });

                            this.dropDownButton.set("label", labels.length + ' group(s) selected');
                        }
                    }
                });

                var groupCheckedMultiSelect = new MyGroupCheckedMultiSelect({
                    id: 'groupChkMultiSelect',
                    dropDown: true,
                    multiple: true,
                    label: this.nls.groupMultiSelectDefault,
                    onChange: lang.hitch(this, function (result) {
                        this._groupsSharedTo = result;
                    })
                });

                groupCheckedMultiSelect.set('style', { width: '100%', height: '30px', fontSize: '14px' });
                groupCheckedMultiSelect.startup();
                domConstruct.place(groupCheckedMultiSelect.domNode, groupDiv);

                var andorDiv = domConstruct.toDom('<div id = "andorDiv">And/or</div>');
                domConstruct.place(andorDiv, groupDiv);

                var MyIndivCheckedMultiSelect = declare(CheckedMultiSelect, {
                    startup: function () {
                        this.inherited(arguments);
                        setTimeout(lang.hitch(this, function () {
                            this.dropDownButton.set("label", this.label);
                        }));
                    },

                    _updateSelection: function () {
                        this.inherited(arguments);
                        if (this.dropDown && this.dropDownButton) {
                            var labels = [];
                            array.forEach(this.options, function (option) {
                                if (option.selected) {
                                    labels.push(option.label);
                                }
                            });

                            this.dropDownButton.set("label", labels.length + ' individual(s) selected');
                        }
                    }
                });

                var indivDiv = domConstruct.create('div', { id: 'individualdiv' });
                var indivCheckedMultiSelect = new MyIndivCheckedMultiSelect({
                    id: 'indivChkMultiSelect',
                    dropDown: true,
                    multiple: true,
                    maxHeight: 300,
                    label: this.nls.indivMultiSelectDefault,
                    onChange: lang.hitch(this, function (result) {
                        this._individualsSharedTo = result;
                    }),
                    onAfterAddOptionItem: function (item, option) {
                    }
                });
                indivCheckedMultiSelect.set('style', { width: '100%', height: '30px', fontSize: '14px' });
                indivCheckedMultiSelect.startup();
                domConstruct.place(indivCheckedMultiSelect.domNode, indivDiv);

                domConstruct.place(shareToLabelDiv, shareToDiv);
                domConstruct.place(shareToSelectDiv, shareToContentDiv);
                domConstruct.place(groupDiv, groupIndivDiv);
                domConstruct.place(andorDiv, groupIndivDiv);
                domConstruct.place(indivDiv, groupIndivDiv);
                domConstruct.place(groupIndivDiv, shareToContentDiv);
                domConstruct.place(shareToContentDiv, shareToDiv);

                return shareToDiv;
            },

            _createSaveBtnDiv: function () {
                var saveBtnDiv = domConstruct.create('div', { id: 'saveBtnDiv' });

                var saveBtn = new Button({
                    id: 'saveBtn',
                    label: 'SAVE',
                    showLabel: true
                });
                domStyle.set(saveBtn.domNode, "width", "100%");
                domStyle.set(saveBtn.domNode.firstChild, "display", "block");
                domConstruct.place(saveBtn.domNode, saveBtnDiv);

                return saveBtnDiv;
            },

            _createSaveDialogContent: function () {
                var dialogDiv = domConstruct.create('div');

                domConstruct.place(this._createCloseImgBtnDivSave(), dialogDiv);
                domConstruct.place(this._createConfigComboBox(), dialogDiv);
                domConstruct.place(this._createDesptTextarea(), dialogDiv);
                domConstruct.place(this._createAdvSetting(), dialogDiv);
                domConstruct.place(this._createShareToDiv(), dialogDiv);
                domConstruct.place(this._createSaveBtnDiv(), dialogDiv);

                this._saveDialogContent = dialogDiv;
            },

            _updateDesptTextarea: function (config) {
                var configDespt = '';
                array.forEach(this.mapstates, lang.hitch(this, function (item) {
                    if (item.configName === config) {
                        if (!Common.isEmpty(item.configDespt))
                            configDespt = item.configDespt;
                    }
                }));

                dijit.byId('configDesptTextarea').set('value', configDespt);
            },

            _updateAdvancedSetting: function (config) {
                var configs = [];

                array.forEach(this.mapstates, lang.hitch(this, function (item) {
                    if (item.configName === config) {
                        if (!Common.isEmpty(item.extent))
                            configs.push(this.nls.advSettingList[0]);
                        if (!Common.isEmpty(item.layers))
                            configs.push(this.nls.advSettingList[1]);
                        if (!Common.isEmpty(item.graphicsLayers))
                            configs.push(this.nls.advSettingList[2]);
                        if (!Common.isEmpty(item.layerDef))
                            configs.push(this.nls.advSettingList[3]);
                    }
                }));

                query('.jimu-widget-chkpreferences').forEach(function (chk) {
                    if (configs.indexOf(chk.id.substring(3)) >= 0)
                        chk.checked = true;
                    else
                        chk.checked = false;
                });
            },

            _updateShareTo: function (config) {
                var shareTo;
                var groups = [];
                var indivs = [];

                array.forEach(this.mapstates, lang.hitch(this, function (item) {
                    if (item.configName === config) {
                        if (!Common.isEmpty(item.configAccess.org))
                            shareTo = this.nls.shareTo[0];
                        else if (!Common.isEmpty(item.configAccess.groups) || !Common.isEmpty(item.configAccess.individuals)) {
                            shareTo = this.nls.shareTo[1]
                            if (item.configAccess.groups.length > 0) {
                                array.forEach(item.configAccess.groups, lang.hitch(this, function (group) {
                                    groups.push(group.name);
                                }));
                            }
                            if (item.configAccess.individuals.length > 0) {
                                array.forEach(item.configAccess.individuals, lang.hitch(this, function (indiv) {
                                    indivs.push(indiv.name);
                                }));
                            }
                        }
                        else
                            shareTo = this.nls.shareTo[2]
                    }
                }));

                if (shareTo)
                    dijit.byId('shareToSelect').set('value', shareTo);
                if (groups.length > 0)
                    dijit.byId('groupChkMultiSelect').set('value', groups);
                if (indivs.length > 0)
                    dijit.byId('indivChkMultiSelect').set('value', indivs);
            },

            _resetDesptTextarea: function () {
                dijit.byId('configDesptTextarea').set('value', '');
            },

            _resetAdvancedSetting: function () {
                query('.jimu-widget-chkpreferences').forEach(function (chk) {
                    chk.checked = true;
                });
            },

            _resetShareTo: function () {
                dijit.byId('shareToSelect').set('value', this.nls.shareToSelectDefault);

                dijit.byId('groupChkMultiSelect').set('value', []);
                dijit.byId('groupChkMultiSelect')._updateSelection();

                dijit.byId('indivChkMultiSelect').set('value', []);
                dijit.byId('indivChkMultiSelect')._updateSelection();
            },

            _getShareToList: function () {
                var shareToList = [];

                if (this.map.itemInfo.item.access === 'shared')
                    shareToList = this.nls.shareTo.slice(1);
                else if (this.map.itemInfo.item.access === 'private')
                    shareToList = this.nls.shareTo.slice(2);
                else
                    shareToList = this.nls.shareTo.slice(1);

                return shareToList;
            },

            _onSaveDialogBtnClicked: function () {
                popup.open({
                    popup: this._saveDialog,
                    around: this.btnSaveDialog
                });
            },

            _retrieveConfigurations: function () {
                var configStore = [];
                if (this.mapstates.length > 0) {
                    array.forEach(this.mapstates, lang.hitch(this, function (mapstate) {
                        var configName = {};
                        if (mapstate.configOwner === this.userName) {
                            configName.name = mapstate.configName;
                            configStore.push(configName);
                        }
                    }));
                }

                return configStore.sort();
            },

            _retrieveMapState: function () {
                var params = {
                    'Method': 'Get',
                    'Web_Map_ID': this.map.itemId
                };
                this._geoprocessor.execute(params, lang.hitch(this, function (results) {
                    if (results && results.length > 0) {
                        this._mapStateJsonRemote = results[0].value;

                        var stateDataArray = [];
                        array.forEach(results[0].value.mapstates, lang.hitch(this, function (item) {
                            stateDataArray.push(this.MapStateManager._prepareMapState(item));
                        }));
                        this._addMapstate(stateDataArray);
                        if (this.shelter) {
                            this.shelter.hide();
                        }
                    }
                })).then(lang.hitch(this, function () {
                    var configStore = new Memory({
                        data: this._retrieveConfigurations()
                    });
                    dijit.byId('configComboBox').set('store', configStore);
                    if (this.mapstateMsgNode.innerHTML == "Loading......") {
                        this.mapstateMsgNode.innerHTML = "";
                    }
                    if (this._individualsAll.length > 0) {
                        this._individualsAll.sort(function (a, b) { return (a.label > b.label) ? 1 : ((b.label > a.label) ? -1 : 0); });
                        //this._individualsAll = this._individualsAll.filter(i => i.value != this.userName);
                        this._individualsAll = this._individualsAll.filter(lang.hitch(this, function (item) {
                            return item.value != this.userName;
                        }));
                        var indStore = new Memory({ data: this._individualsAll, idProperty: "value" });
                        var inddataStore = new DataStore({ objectStore: indStore, labelProperty: "label" });
                        dijit.byId('indivChkMultiSelect').set('store', inddataStore);
                    }
                    if (this.shelter) {
                        this.shelter.hide();
                    }
                }));
            },

            _addMapstate: function (stateData) {
                this.shelter.show();
                LayerInfos.getInstance(this.map, this.map.itemInfo)
                    .then(lang.hitch(this, function (layerInfosObj) {
                        this.layerInfosObj = layerInfosObj;
                        if (stateData.length > 0) {
                            Common.emptyArray(this.mapstates);
                            array.forEach(stateData, lang.hitch(this, function (item) {
                                if (item.extent || item.layers) {
                                    this.mapstates.push(item);

                                    if (this.mapstates.length === 0) {
                                        this._readMapstatesInWebmap();
                                    }
                                } else {
                                    var msgText = utils.stripHTML(this.nls.errorNameEmpty);
                                    msgText = msgText.replace('%mapName%', this.mapName);
                                    this.mapstateMsgNode.innerHTML = msgText;
                                }
                                if (!this._isFirstLoaded)
                                    this.displayMapstates();

                            }));
                        }

                        this._createLoadDialogContent(this.mapstates);
                        this._createLoadDialog();
                    }));
                this.shelter.hide();
            },

            displayMapstates: function () {
                if (this.mapstates && this.mapstates.length > 0) {
                    var mapstate = this.mapstates[this.mapstates.length - 1];
                    var msgText = utils.stripHTML(this.nls.msgStateStatus);
                    msgText = msgText.replace('%date%', mapstate.updateDate);
                    this.mapstateMsgNode.innerHTML = msgText;
                } else {
                    var msgText = utils.stripHTML(this.nls.errorNameEmpty);
                    msgText = msgText.replace('%mapName%', this.mapName);
                    this.mapstateMsgNode.innerHTML = msgText;
                }

                this.resize();
            },

            _readMapstatesInWebmap: function () {
                if (!this.map.itemInfo || !this.map.itemInfo.itemData ||
                    !this.map.itemInfo.itemData.mapstates) {
                    return;
                }
                array.forEach(this.map.itemInfo.itemData.mapstates, function (mapstate) {
                    mapstate.isInWebmap = true;
                    this.mapstates.push(mapstate);
                }, this);
            },

            _initGPService: function () {
                this._geoprocessor = new Geoprocessor(this.gpServiceUrl);
            },

            _initPrintTask: function () {
                this._printTask = new PrintTask(this.exportWebMapUrl);
                var template = new PrintTemplate();
                var params = new PrintParameters();

                template.exportOptions = {
                    width: this._thumbnailWidth,
                    height: this._thumbnailHeight,
                    dpi: this._thumbnailDpi
                };

                template.format = this._thumbnailFormat;
                template.layout = this._templateLayout;
                template.preserveScale = this._preserveScale;
                template.showAttribution = this._showAttribution;

                params.map = this.map;
                params.template = template;

                this._printTaskParams = params;
            },

            _retrieveConfigNames: function () {
                var configNames = [];
                if (this.mapstates.length > 0) {
                    array.forEach(this.mapstates, lang.hitch(this, function (mapstate) {
                        if (mapstate.configOwner === this.userName) {
                            configNames.push(mapstate.configName.toLowerCase());
                        }
                    }));
                }
                return configNames;
            },

            _getConfigName: function () {
                return dom.byId('configComboBox').value.trim();
            },

            _isValidConfigName: function () {
                if (this._retrieveConfigNames().indexOf(this._getConfigName().toLowerCase()) > -1 || this._getConfigName().toLowerCase() != this.nls.configComboBoxDefault.toLowerCase())
                    return true;
                return false;
            },

            _isOverwriting: function () {
                if (this._retrieveConfigNames().indexOf(this._getConfigName().toLowerCase()) > -1)
                    return true;
                return false;
            },

            _getOperation: function (configName) {
                if (this._retrieveConfigNames().indexOf(configName.toLowerCase()) > -1)
                    return this._operation = this.nls.operations[1];
                return this._operation = this.nls.operations[0];
            },

            _saveMapState: function () {
                if (!this._isValidConfigName() || this._getCheckedAdvSetting().length == 0 || this.nls.shareTo.indexOf(dijit.byId('shareToSelect').value) < 0)
                    return;

                popup.close(this._saveDialog);

                if (this._isOverwriting()) {
                    var confirm = new ConfirmDialog({
                        title: 'Confirmation',
                        content: this.nls.msgOverwriteConfirm,
                        style: 'width: 300px'
                    });

                    confirm.show();

                    confirm.on('cancel', lang.hitch(this, function () {
                        if (this.shelter) {
                            this.shelter.hide();
                        }
                        return;
                    }));

                    this.shelter.show();
                    confirm.on('execute', lang.hitch(this, function () {
                        this._createThumbnail();
                    }));
                }
                else {
                    this.shelter.show();
                    this._createThumbnail();
                }
            },

            _createThumbnail: function () {

                this._printTask.execute(this._printTaskParams, lang.hitch(this, function (result) {
                    var url = result.url;
                    var newName = this.map.itemId + '_' + this.userName + '_' + this._getConfigName() + url.substr(url.lastIndexOf('.'));
                    var newUrl = url.substr(0, url.lastIndexOf('/') + 1) + newName;
                    var newUrl1 = this.advanceThumbnailImageUrl + newName; //***
                    this._renameThumbnailImage(url.substr(url.lastIndexOf('/') + 1), newName);
                    this._createMapstate(this._getConfigName(), newUrl1);

                }));
            },

            _renameThumbnailImage: function (imageUrl, imageName) {
                var params = {
                    'Method': 'Copy',
                    'Image_Url': imageUrl,
                    'Image_Name': imageName
                };

                this._geoprocessor.execute(params).then(lang.hitch(this, function (results) {
                }), lang.hitch(this, function (err) {
                    console.log(err);
                }));
            },

            _deleteThumbnailImage: function (imageName) {
                var params = {
                    'Method': 'DeleteImage',
                    'Image_Name': imageName
                };

                this._geoprocessor.execute(params).then(lang.hitch(this, function (results) {
                }), lang.hitch(this, function (err) {
                    console.log(err);
                }));
            },

            _createConfigAccess: function (name, permission) {
                if (name.constructor === Array) {
                    var accesses = [];
                    array.forEach(name, lang.hitch(this, function (item) {
                        var access = {};
                        access.name = item;
                        access.permission = permission;
                        accesses.push(access);
                    }));
                    return accesses;
                }

                if (typeof name === 'string') {
                    var access = {};
                    access.name = name;
                    access.permission = permission;
                    return access;
                }

                return {};
            },

            _createMapstate: function (configName, thumbnailUrl) {
                this.shelter.show();
                this._getOperation(configName);

                var configAccess = {};

                var accessPrivate = this._createConfigAccess(this.userName, 'RUD');
                configAccess.private = accessPrivate;

                if (dijit.byId('shareToSelect').value === this.nls.shareTo[1] && (this._groupsSharedTo.length > 0 || this._individualsSharedTo.length > 0)) {
                    var accessGroups = this._createConfigAccess(this._groupsSharedTo, 'R');

                    this._individualsSharedTo.push(this.userName);
                    var accessIndividuals = this._createConfigAccess(this._individualsSharedTo, 'R');

                    configAccess.groups = accessGroups;
                    configAccess.individuals = accessIndividuals;
                }
                else if (dijit.byId('shareToSelect').value === this.nls.shareTo[0]) {
                    var accessOrg = this._createConfigAccess('org', 'R');
                    configAccess.org = accessOrg;
                }
                else {
                    configAccess.private = accessPrivate;
                }

                var dataStore = {
                    map: this.map,
                    layerInfosObj: this.layerInfosObj,
                    checkedPreferences: this._getCheckedAdvSetting(),
                    configName: configName,
                    configDespt: dijit.byId('configDesptTextarea').value,
                    operation: this._operation,
                    mapStateJsonRemote: this._mapStateJsonRemote,
                    thumbnailUrl: thumbnailUrl,
                    configAccess: configAccess,
                    configOwner: this.userName
                };

                LayerInfos.getInstance(this.map, this.map.itemInfo)
                    .then(lang.hitch(this, function (layerInfosObj) {
                        this.layerInfosObj = layerInfosObj;
                        dataStore.storeStrategy = 'remote';
                        var stateData = this.MapStateManager._generateMapState(dataStore);
                        var stateDataText = JSON.stringify(stateData);

                        var params = {
                            'Method': 'Post',
                            'Web_Map_ID': this.map.itemId,
                            'Input': stateDataText
                        };

                        //For Sync GP service
                        this._geoprocessor.execute(params).then(lang.hitch(this, function (data) {
                            this._displaySaveSuccessMassage();

                            this._isDeleted = false;
                            this._isFirstLoaded = true;
                            //update this.mapstates
                            this._retrieveMapState();
                        }), lang.hitch(this, function (err) {
                            var msgText = utils.stripHTML(this.nls.errSaveFailure);
                            msgText = msgText.replace('%mapName%', this.mapName);
                            this.mapstateMsgNode.innerHTML = msgText;
                            this.shelter.hide();
                        }));
                    }));

                this.resize();
            },

            _displaySaveSuccessMassage: function () {
                //update SAVE or OVERWRITE success message
                var msgText = utils.stripHTML(this.nls.msgSaveSuccess);
                msgText = msgText.replace('%mapName%', this.mapName);
                msgText = msgText.replace('%savedPreferences%', this._buildCheckedPreferenceString());
                msgText = msgText.replace('%configName%', this._getConfigName());
                this.mapstateMsgNode.innerHTML = msgText;
                if (this.shelter) {
                    this.shelter.hide();
                }
            },

            _getCheckedAdvSetting: function () {
                var checkedpreferences = [];
                query('.jimu-widget-chkpreferences').forEach(function (chk) {
                    if (chk.checked)
                        checkedpreferences.push(chk.id.substring(3));
                });

                return checkedpreferences;
            },

            _buildCheckedPreferenceString: function () {
                if (this._getCheckedPreferenceLabels().length <= 0)
                    return '(none)';
                return '(' + this._getCheckedPreferenceLabels().join() + ')';
            },

            _getCheckedPreferenceLabels: function () {
                var checkedLabels = [];
                query('.jimu-widget-chkpreferences').forEach(lang.hitch(this, function (chk) {
                    if (chk.checked)
                        checkedLabels.push(Common.switchNameLabel(chk.id.substring(3), this.nls.advSettingList, this.nls.advSettingLabels));
                }));

                return checkedLabels;
            },

            _createLoadDialog: function () {
                this._tooltipDialog = new TooltipDialog({
                    style: 'width: 650px; height: 400px',
                    content: this._loadDialogContent
                });
                this._loadDialog = this._tooltipDialog;

                //return empty
                //console.info(query('.project-preference-thumbnail-image'));

                popup.open({
                    popup: this._loadDialog,
                    around: this.btnLoadDialog
                });

                if (this._selectedTab)
                    this._tcConfigs.selectTab(this._selectedTab);

                if (!this._isDeleted)
                    popup.close(this._loadDialog);

                //return correct content
                //console.info(query('.project-preference-thumbnail-image'));

                this._bindThumbnailClickEvent();
                this._bindDeleteClickEvent();
            },

            _createTabContainerDiv: function (mapstates) {
                var tcDiv = domConstruct.create('div', { id: 'tcDiv' });
                var configs = this._categorizeConfigs(mapstates);

                //orgConfigs = this._buildConfigTabContent(configs[0]);
                sharedConfigs = this._buildConfigTabContent(configs[1]);
                myConfigs = this._buildConfigTabContent(configs[2]);

                //var orgConfigsDiv = domConstruct.create('div', {id: 'orgTabDiv'});
                var sharedConfigsDiv = domConstruct.create('div', { id: 'sharedTabDiv' });
                var myConfigsDiv = domConstruct.create('div', { id: 'myTabDiv' });

                //orgConfigsDiv.innerHTML = orgConfigs;
                sharedConfigsDiv.innerHTML = sharedConfigs;
                myConfigsDiv.innerHTML = myConfigs;

                this._tcConfigs = new TabContainer({
                    tabs: [/*{
                    id: 'tab1',
                    title : this.nls.configTabTitles[0],
                    content : orgConfigsDiv
                },*/ {
                            id: 'tab2',
                            title: this.nls.configTabTitles[1],
                            content: sharedConfigsDiv
                        }, {
                            id: 'tab3',
                            title: this.nls.configTabTitles[2],
                            content: myConfigsDiv
                        }],
                    isNested: true,
                    style: 'width: 620px; height: 400px'
                });

                this._tcConfigs.startup();

                this.own(on(this._tcConfigs, 'tabChanged', lang.hitch(this, function (tab) {
                    this._selectedTab = tab;
                })));

                domConstruct.place(this._tcConfigs.domNode, tcDiv);

                return tcDiv;
            },

            _applyFilterAndSort: function () {
                console.log('apply filter ' + this._filterText + ' and sort ' + this._currentSortBy);
                this._createLoadDialogContent(this.mapstates);
                this._createLoadDialog();
                // keep the dialog open
                popup.open({
                    popup: this._loadDialog,
                    around: this.btnLoadDialog
                });
                this._filterAndSortApplied = true;
                this._applyButton.disabled = 'disabled';
            },

            _createFilterAndSortDiv: function () {
                var fsDiv = domConstruct.create('div', { id: 'filterAndSortDiv' });

                // filter text input
                var filterLabel = domConstruct.create('span', {
                    innerHTML: this.nls.filterLabel, className: 'project-preference-filter-label'
                });
                domConstruct.place(filterLabel, fsDiv);
                var filterInput = domConstruct.create('input', {
                    id: 'filterInput', type: 'text', placeHolder: 'Enter text to filter',
                    className: 'project-preference-filter-input',
                    value: this._filterText
                });
                domConstruct.place(filterInput, fsDiv);
                on(filterInput, 'keyup', lang.hitch(this, function (evt) {
                    this._filterText = evt.target.value;
                    this._filterAndSortApplied = false;
                    this._applyButton.disabled = '';
                    var keyUp = evt.which || evt.keyCode;
                    if (keyUp === 13 /*Enter*/) {
                        this._applyFilterAndSort();
                    }
                }));

                // sortBy dropdown
                var sortByLabel = domConstruct.create('span', {
                    innerHTML: this.nls.sortByLabel, className: 'project-preference-sortBy-label'
                });
                domConstruct.place(sortByLabel, fsDiv);
                var sortBySelect = domConstruct.create('select', { id: 'sortBySelect', className: 'project-preference-sortBy-select' });
                domConstruct.place(sortBySelect, fsDiv);
                array.forEach(this.sortByOptions, lang.hitch(this, function (opt) {
                    var sortByOpt = domConstruct.create('option', { value: opt, innerHTML: this.nls["sortByOption_" + opt] });
                    if (opt === this._currentSortBy) {
                        sortByOpt.selected = 'selected';
                    }
                    domConstruct.place(sortByOpt, sortBySelect);
                }));
                on(sortBySelect, 'change', lang.hitch(this, function (evt) {
                    this._currentSortBy = evt.target.value;
                    this._filterAndSortApplied = false;
                    this._applyButton.disabled = '';
                }));

                // sort order
                var sortOrderDiv = domConstruct.create('img', {
                    src: this._currentSortOrder == 'ascending' ? './widgets/AdvancedSave/images/sorting_a-z.png' : './widgets/AdvancedSave/images/sorting_z-a.png',
                    className: 'project-preference-sort-order-img',
                    title: this.nls.sortOrderTitle
                    //sortOrder: 'descending'
                });
                domConstruct.place(sortOrderDiv, fsDiv);
                on(sortOrderDiv, 'click', lang.hitch(this, function (evt) {
                    if (this._currentSortOrder === 'descending') {
                        this._currentSortOrder = 'ascending';
                        evt.target.src = './widgets/AdvancedSave/images/sorting_a-z.png'
                    } else {
                        this._currentSortOrder = 'descending';
                        evt.target.src = './widgets/AdvancedSave/images/sorting_z-a.png'
                    }
                    this._filterAndSortApplied = false;
                    this._applyButton.disabled = '';
                }));

                // apply button
                this._applyButton = domConstruct.create('button', {
                    innerHTML: this.nls.filterSortApplyButtonLabel,
                    className: 'project-preference-filter-sort-apply-button',
                    disabled: 'disabled'
                });
                domConstruct.place(this._applyButton, fsDiv);
                on(this._applyButton, "click", lang.hitch(this, this._applyFilterAndSort));

                // add the diaglog close button
                domConstruct.place('<img class="closeImgBtn" src="./widgets/AdvancedSave/images/Grey_close.png" alt="Submit" \
                align="right" onclick="dijit.popup.close(this._loadDialog);return false;">', fsDiv);

                return fsDiv;
            },

            _createLoadDialogContent: function (mapstates) {
                var loadDialogDiv = domConstruct.create('div');
                domConstruct.place(this._createFilterAndSortDiv(), loadDialogDiv);
                domConstruct.place(this._createTabContainerDiv(mapstates), loadDialogDiv);

                this._loadDialogContent = loadDialogDiv;
            },

            _buildConfigTabContent: function (configs) {
                var content = new Builder('<ul />');
                content.append('<li />');
                array.forEach(configs, lang.hitch(this, function (item) {
                    content.append('<li id="' + item.configOwner + this.KEY_SEPARATOR + item.configName + 'li"> \
                        <div class="project-preference-thumbnail-image-text"><div class="project-preference-thumbnail" \
						title="' + (item.configDespt ? item.configDespt : "") + '"> \
                        <img id="' + item.configOwner + this.KEY_SEPARATOR + item.configName + '" src="' + item.thumbnailUrl + '" \
                        class="project-preference-thumbnail-image" /></div><div class="project-preference-thumbnail-text"> \
                        <ul><li><b>Map Name:</b>  ' + this.mapName + '</li><li><b>Map State Name:</b>  ' + item.configName + '</li> \
                        <li><b>Map State Owner:</b>  ' + item.configOwner + '</li><li><b> \
                        Last Updated Date:</b> ' + item.updateDate + '</li><li>');
                    if (item.configOwner === this.userName) {
                        content.append('<b><a id="' + item.configOwner + this.KEY_SEPARATOR + item.configName + 'del" class="project-preference-delete" href="#"> \
                        Delete</a></b></li></ul></div></div></li>');
                    } else {
                        content.append('</div></div></li>');
                    }
                }));
                return content;
            },

            _onLoadDialogBtnClicked: function () {
                if (!this._loadDialog)
                    return;

                popup.open({
                    popup: this._loadDialog,
                    around: this.btnLoadDialog
                });
            },

            _bindThumbnailClickEvent: function () {
                query('.project-preference-thumbnail-image').forEach(lang.hitch(this, function (img) {
                    on(img, 'click', lang.hitch(this, function () {
                        var mapstate = this.mapstates[this._getMapStateIndex(img.id)];
                        this._applyMapstate(mapstate, this.map, img.id);
                    }));
                }));
            },

            _bindDeleteClickEvent: function () {
                query('.project-preference-delete').forEach(lang.hitch(this, function (item) {
                    on(item, 'click', lang.hitch(this, function () {
                        this._onDeleteBtnClicked(item.id.substr(0, item.id.length - 3));
                    }));
                }));
            },

            _configKey2Owner: function (configKey) {
                if (configKey) {
                    return configKey.substr(0, configKey.indexOf(this.KEY_SEPARATOR));
                } else {
                    return undefined;
                }
            },
            _configKey2Name: function (configKey) {
                if (configKey) {
                    return configKey.substr(configKey.indexOf(this.KEY_SEPARATOR) + this.KEY_SEPARATOR.length);
                } else {
                    return undefined;
                }
            },

            _getMapStateIndex: function (configKey) {
                var index = -1;
                array.forEach(this.mapstates, function (item, i) {
                    var cfgOwner = this._configKey2Owner(configKey);
                    var cfgName = this._configKey2Name(configKey);
                    if (item.configOwner === cfgOwner && item.configName === cfgName)
                        index = i;
                }, this);

                return index;
            },

            _categorizeConfigs: function (mapstates) {

                if (mapstates.length <= 0)
                    return [];

                var filterTextLower = this._filterText.trim().toLowerCase();
                var filteredMapStates = mapstates.filter(function (item) {
                    return (("" === filterTextLower) || (-1 < item.configName.toLowerCase().search(filterTextLower)));
                });

                filteredMapStates.sort('owner' === this._currentSortBy ? lang.hitch(this, function (item1, item2) {
                    var a = item1.configOwner.trim().toLowerCase();
                    var b = item2.configOwner.trim().toLowerCase();
                    if (this._currentSortOrder === 'descending')
                        return (a < b ? 1 : (a > b ? -1 : 0));
                    else
                        return (a < b ? -1 : (a > b ? 1 : 0));
                }) : ('name' === this._currentSortBy ? lang.hitch(this, function (item1, item2) {
                    var a = item1.configName.trim().toLowerCase();
                    var b = item2.configName.trim().toLowerCase();
                    if (this._currentSortOrder === 'descending')
                        return (a < b ? 1 : (a > b ? -1 : 0));
                    else
                        return (a < b ? -1 : (a > b ? 1 : 0));
                }) : /*'date' === this._currentSortBy*/ lang.hitch(this, function (item1, item2) {
                    result = 0;
                    try {
                        var a = Date.parse(item1.updateDate);
                        var b = Date.parse(item2.updateDate);
                        if (this._currentSortOrder === 'descending')
                            result = (a < b ? 1 : (a > b ? -1 : 0));
                        else
                            result = (a < b ? -1 : (a > b ? 1 : 0));
                    } catch (e) {
                        result = 0;
                    }
                    return result;
                })));

                var configs = [];

                var orgConfigs = [];
                var sharedConfigs = [];
                var myConfigs = [];

                array.forEach(filteredMapStates, lang.hitch(this, function (item) {
                    if (item.configOwner === this.userName) {
                        myConfigs.push(item)
                    }

                /*if(item.configAccess.org){
                    orgConfigs.push(item);
                }
                else*/ if ((item.configAccess.groups && item.configAccess.groups.length > 0) || (item.configAccess.individuals && item.configAccess.individuals.length > 0)) {
                        var added = false;

                        if (item.configAccess.groups && item.configAccess.groups.length > 0) {
                            for (i = 0; i < item.configAccess.groups.length; i++) {
                                var group = item.configAccess.groups[i];
                                if (this._accessibleGroups.indexOf(group.name) >= 0) {
                                    sharedConfigs.push(item);
                                    added = true;
                                    break;
                                }
                            }
                        }

                        if (!added) {
                            if (item.configAccess.individuals && item.configAccess.individuals.length > 0) {
                                for (i = 0; i < item.configAccess.individuals.length; i++) {
                                    var indiv = item.configAccess.individuals[i];
                                    if (indiv.name === this.userName) {
                                        sharedConfigs.push(item);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }));

                if (orgConfigs.length > 0)
                    Common.removeArrayFromArray(myConfigs, orgConfigs);

                if (sharedConfigs.length > 0)
                    Common.removeArrayFromArray(myConfigs, sharedConfigs);

                configs.push(orgConfigs);
                configs.push(sharedConfigs);
                configs.push(myConfigs);

                return configs;
            },

            _onDeleteBtnClicked: function (configKey) {
                this._confirm = new ConfirmDialog({
                    title: 'Confirmation',
                    content: this.nls.msgDeleteConfirm,
                    style: 'width: 300px'
                });

                popup.close(this._loadDialog);

                this._confirm.show();

                this._confirm.on('execute', lang.hitch(this, function () {
                    this._deleteMapState(configKey, this.nls.operations[2]);
                    this.resize();
                    popup.open({
                        popup: this._loadDialog,
                        around: this.btnLoadDialog
                    });
                }));

                this._confirm.on('cancel', lang.hitch(this, function () {
                    popup.open({
                        popup: this._loadDialog,
                        around: this.btnLoadDialog
                    });
                }));
            },

            _deleteMapState: function (configKey, operation) {
                this.shelter.show();
                var index = this._getMapStateIndex(configKey);
                if (index < 0)
                    return;
                var deleteThumbnailimageUrl = this.mapstates[index].thumbnailUrl.substr(this.mapstates[index].thumbnailUrl.lastIndexOf('/') + 1);
                this.mapstates.splice(index, 1);

                var dataStore = {
                    map: this.map,
                    layerInfosObj: this.layerInfosObj,
                    configName: this._configKey2Name(configKey),
                    operation: operation,
                    thumbnailUrl: '',
                    configOwner: this.userName
                };

                // update _mapStateJsonRemote
                this._mapStateJsonRemote = this.MapStateManager.spliceConfigFromMapState(this._mapStateJsonRemote, this._configKey2Name(configKey));

                //save updated _mapStateJsonRemote to remote
                dataStore.storeStrategy = 'remote';
                dataStore.mapStateJsonRemote = this._mapStateJsonRemote;

                var stateData = this.MapStateManager._generateMapState(dataStore);
                var stateDataText = json.stringify(stateData);

                var params = {
                    'Method': 'Post',
                    'Web_Map_ID': this.map.itemId,
                    'Input': stateDataText
                };

                this._geoprocessor.execute(params).then(lang.hitch(this, function (data) {
                    this._deleteThumbnailImage(deleteThumbnailimageUrl); //*** To Delete the thumbnail image after the state is deleted
                    this._isDeleted = true;
                    this._retrieveMapState();

                    //display DELETE success message
                    var msgText = utils.stripHTML(this.nls.msgDeleteSuccess);
                    msgText = msgText.replace('%mapName%', this.mapName);
                    msgText = msgText.replace('%configName%', this._configKey2Name(configKey));
                    this.mapstateMsgNode.innerHTML = msgText;
                    this.shelter.hide();
                }), lang.hitch(this, function (err) {
                    var msgText = utils.stripHTML(this.nls.errSaveFailure);
                    msgText = msgText.replace('%mapName%', this.mapName);
                    this.mapstateMsgNode.innerHTML = msgText;
                    this.shelter.hide();
                }));
            },

            _applyMapstate: function (stateData, map, configKey) {
                this._updateLastOpenedDate(stateData);
                this._applyLayersAndFilters(stateData, map);
                this._applyMapExtent(stateData, map);
                this._applyMapGraphics(stateData, map);                
                this._displayLoadSuccessMessage(configKey);
                if (this.shelter) {
                    this.shelter.hide();
                }
            },

        _updateLastOpenedDate: function (openedStateData) {

            var stateData = this.MapStateManager.updateMapStateLastOpenedDate(this._mapStateJsonRemote, openedStateData.configName, openedStateData.configOwner);

            if (stateData) {

                var stateDataText = json.stringify(stateData);

                var params = {
                    'Method': 'Post',
                    'Web_Map_ID': this.map.itemId,
                    'Input': stateDataText
                };

                this._geoprocessor.execute(params).then(lang.hitch(this, function (data) {
                    //update this.mapstates
                    //this._retrieveMapState();
                }), lang.hitch(this, function (err) {
                    //this.shelter.hide();
                }));
            }
        },

        _applyLayersAndFilters: function (stateData, map) {
            if (!Common.isEmpty(stateData.layers)) {
                var layerData = stateData.layers;
                var filterData = stateData.layerDef;
                this.layerInfosObj.restoreState({
                    layerOptions: layerData || null
                });

                var rLayers = [];
                array.forEach(this.layerInfosObj.getLayerInfoArray(), function (rootLayerInfo) {
                    if (layerData[rootLayerInfo.id]) {
                        rootLayerInfo.popup = true;                            
                        rootLayerInfo.setOpacity(layerData[rootLayerInfo.id].opacity);
                        //alert(rootLayerInfo.id);
                        if (rootLayerInfo.layerObject.type === 'Feature Layer') {
                            if (filterData[rootLayerInfo.id] && filterData[rootLayerInfo.id].defnExpr[0]) {
                                rootLayerInfo.layerObject.setDefinitionExpression(filterData[rootLayerInfo.id].defnExpr[0]);
                            }
                            //else{
                            //	rootLayerInfo.layerObject.setDefinitionExpression("")
                            //}
                        }
                        else {
                            if (filterData[rootLayerInfo.id] && filterData[rootLayerInfo.id].defnExpr) {
                                rootLayerInfo.layerObject.setLayerDefinitions(filterData[rootLayerInfo.id].defnExpr);
                            }
                            //else{
                            //	rootLayerInfo.layerObject.setLayerDefinitions("")
                            //}
                        }
                    }
                    else {
                        rLayers.push(rootLayerInfo.id);
                    }
                }, this);

                for (var i = rLayers.length - 1; i >= 0; i--) {
                    var removeLayer = map.getLayer(rLayers[i]);
                    if (removeLayer) {
                        map.removeLayer(map.getLayer(rLayers[i]));
                        removeLayer = null;
                    };
                }

                var dynamicData = stateData.dynamicData;
                var layerObjects = array.map(this.layerInfosObj.getLayerInfoArray(), function (layer) {
                    return layer.layerObject.url;
                })
                this.requestGroup = [];
                this.dynamicData_List = [];
                for (var key in dynamicData) {
                    if (dynamicData[key].url != undefined) {
                        console.log(dynamicData[key].url);
                        if (layerObjects.indexOf(dynamicData[key].url) == -1) {
                            this.dynamicData_List.push(dynamicData[key]);
                            if (dynamicData[key].type == 'ArcGISDynamicMapServiceLayer') {
                                var dynamicLayer = new ArcGISDynamicMapServiceLayer(dynamicData[key].url, {
                                    'visible': dynamicData[key].visible,
                                    'opacity': dynamicData[key].opacity,
                                    'visibleLayers': dynamicData[key].visibleLayers
                                });
                                map.addLayer(dynamicLayer);
                                dynamicLayer.on('load', lang.hitch(this, function () {
                                    this._applyPopupforExternalLayers(dynamicData);
                                }));
                            }
                            else if (dynamicData[key].type == 'ArcGISTiledMapServiceLayer') {
                                var tiledLayer = new ArcGISTiledMapServiceLayer(dynamicData[key].url, {
                                    'visible': dynamicData[key].visible,
                                    'opacity': dynamicData[key].opacity
                                });
                                map.addLayer(tiledLayer);
                                tiledLayer.on('load', lang.hitch(this, function () {
                                    this._applyPopupforExternalLayers(dynamicData);
                                }));
                            }
                            else if (dynamicData[key].type == 'ArcGISImageServiceLayer') {
                                var imageLayer = new ArcGISImageServiceLayer(dynamicData[key].url, {
                                    'id': dynamicData[key].title,
                                    'visible': dynamicData[key].visible,
                                    'opacity': dynamicData[key].opacity
                                });
                                map.addLayer(imageLayer);
                                imageLayer.on('load', lang.hitch(this, function () {
                                    this._applyPopupforExternalLayers(dynamicData);
                                }));

                            }
                            else if (dynamicData[key].type == 'WMSLayer') {
                                try {
                                    var wmsLayer = new WMSLayer(dynamicData[key].url, {
                                        'visible': dynamicData[key].visible,
                                        'opacity': dynamicData[key].opacity,
                                        'visibleLayers': dynamicData[key].visibleLayers
                                    });
                                    map.addLayer(wmsLayer);
                                    wmsLayer.on('load', lang.hitch(this, function () {
                                        this._applyPopupforExternalLayers(dynamicData);
                                    }));
                                }
                                catch (err) {
                                    console.log('Failed to add WMS Layer' + dynamicData[key].url + err);
                                }
                            }
                            else if (dynamicData[key].type === 'ArcGISFeatureLayer' || dynamicData[key].type === 'FeatureLayer') { //***
                                var fLayer = new FeatureLayer(dynamicData[key].url, {
                                    'visible': dynamicData[key].visible,
                                    'popup': dynamicData[key].enablePopup,
                                    'opacity': dynamicData[key].opacity
                                     
                                });
                                map.addLayer(fLayer);
                                fLayer.on('load', lang.hitch(this, function () {
                                    this._applyPopupforExternalLayers(dynamicData);                                   
                                }));
                            }
                            else {
                                console.log('New Layer Type needs to be implemented');
                            }
                        }
                    }
                }//For loop
                // to enable or disable popup from json
                this._applyPopupforInternalLayers(layerData);
                /*
                if (this.layerInfosObj && this.layerInfosObj.traversal) {
                    this.layerInfosObj.traversal(lang.hitch(this, function (layerInfo) {
                        if (layerData[layerInfo.id]) {
                            if (layerData[layerInfo.id].enablePopup !== undefined) {
                                if (layerData[layerInfo.id].enablePopup) {
                                    //layerInfo.controlPopupInfo.enablePopup = true;
                                    var featureLayerInfo = this.layerInfosObj.getLayerInfoById(layerInfo.id);
                                    featureLayerInfo.loadInfoTemplate().then(lang.hitch(this, function () {
                                        featureLayerInfo.enablePopup();
                                    }));
                                }
                                else {
                                    var featureLayerInfo1 = this.layerInfosObj.getLayerInfoById(layerInfo.id);
                                    featureLayerInfo1.loadInfoTemplate().then(lang.hitch(this, function () {
                                        featureLayerInfo1.disablePopup();
                                    }));
                                }
                            }                            
                        }
                    }));
                }
                */
               

            }
        },

            _applyPopupforExternalLayers: function (dynamicData) {

                LayerInfos.getInstance(this.map, this.map.itemInfo).then(function (layerInfosObj) {

                    layerInfosObj.traversal(lang.hitch(this, function (layerInfo) {
                        var dynamicKey = "";                        
                        var subKey = "";                        
                       
                      if (layerInfo.parentLayerInfo != undefined) {
                          var t = 'T';

                          for (var key in dynamicData) {
                              if (dynamicData[key].url != undefined) {
                                  if (layerInfo.layerObject.url.indexOf(dynamicData[key].url) > -1) {
                                      dynamicKey = key;
                                      if (layerInfo.id.indexOf("_" > -1)) {
                                          subKey = layerInfo.id.split("_")[1];
                                      }
                                      dynamicKey = dynamicKey.split("_")[0] + "_" + subKey;
                                      break;
                                  }
                              }
                          }
                          if (dynamicData[dynamicKey] != undefined) {
                              //layerInfo.visible = dynamicData[layerInfo.id].visible;
                              //layerInfo.setOpacity(dynamicData[layerInfo.id].opacity);
                              if (dynamicData[dynamicKey].enablePopup !== undefined) {
                                  if (dynamicData[dynamicKey].enablePopup) {
                                      layerInfo.enablePopup();
                                  }
                                  else {
                                      layerInfo.disablePopup();
                                  }
                              }
                              //layerInfo.layerObject.setDefinitionExpression(dynamicData[layerInfo.id].layerDefinitions);

                          }                            
                        }
                        else {
                          var t = 'T';

                          ////  if (this.getLayerTypes_id.indexOf(layerInfo.id) < 0) {
                          ////      this.getLayerTypes.push(layerInfo.getLayerType());
                          ////      this.getLayerTypes_id.push(layerInfo.id);
                          ////}

                          for (var key in dynamicData) {
                              if (dynamicData[key].url != undefined) {
                                  if (layerInfo.layerObject.url == dynamicData[key].url) {
                                      dynamicKey = key;
                                      break;
                                  }
                              }
                          }
                          
                          if (dynamicData[dynamicKey] != undefined) {
                              //layerInfo.visible = dynamicData[layerInfo.id].visible;
                              //layerInfo.setOpacity(dynamicData[layerInfo.id].opacity);
                              if (dynamicData[dynamicKey].enablePopup !== undefined) {
                                  if (dynamicData[dynamicKey].enablePopup) {
                                      layerInfo.enablePopup();
                                  }
                                  else {
                                      layerInfo.disablePopup();
                                  }
                              }
                              //layerInfo.layerObject.setDefinitionExpression(dynamicData[layerInfo.id].layerDefinitions);

                          }    

                          /*
                            mapObj.dynamicData[layerInfo.id] = {
                                visible: layerInfo.isVisible(),
                                opacity: layerInfo.getOpacity(),
                                enablePopup: layerInfo.controlPopupInfo.enablePopup, //*** to enable popup
                                layerDefinitions: layerInfo.layerObject.layerDefinitions,
                                url: layerInfo.layerObject.url,
                                type: layerInfo.originOperLayer.layerType,
                                title: layerInfo.layerObject.name,
                                visibleLayers: layerInfo.layerObject.visibleLayers
                            }
                            */
                        }
                    }));
                });

                ////////////////
/*
                LayerInfos.getInstance(this.map, this.map.itemInfo).then(lang.hitch(this, function (layerInfos) {
                    array.forEach(layerInfos._finalLayerInfos, function (info) {
                        console.log(info.title, info.id);
                        for (var key in dynamicData) {
                            if (dynamicData[key].url != undefined) {
                                if (dynamicData[key].url == info.layerObject.url) {
                                    if (info.parentLayerInfo != undefined) {
                                        if (dynamicData[key].enablePopup !== undefined) {
                                            if (dynamicData[key].enablePopup) {
                                                info.enablePopup();
                                            }
                                            else {
                                                info.disablePopup();
                                            }
                                        }
                                    }
                                    else {

                                        if (dynamicData[key].enablePopup !== undefined) {
                                            if (dynamicData[key].enablePopup) {
                                                info.enablePopup();
                                            }
                                            else {
                                                info.disablePopup();
                                            }
                                        }

                                    }
                                    
                                }
                            }
                        }
                    });
                }));*/

            },
            _applyPopupforInternalLayers: function (layerData) {

                if (this.layerInfosObj && this.layerInfosObj.traversal) {
                    this.layerInfosObj.traversal(lang.hitch(this, function (layerInfo) {
                        if (layerData[layerInfo.id]) {
                            if (layerData[layerInfo.id].enablePopup !== undefined) {
                                if (layerData[layerInfo.id].enablePopup) {
                                    //layerInfo.controlPopupInfo.enablePopup = true;
                                    var featureLayerInfo = this.layerInfosObj.getLayerInfoById(layerInfo.id);
                                    featureLayerInfo.loadInfoTemplate().then(lang.hitch(this, function () {
                                        featureLayerInfo.enablePopup();
                                    }));
                                }
                                else {
                                    var featureLayerInfo1 = this.layerInfosObj.getLayerInfoById(layerInfo.id);
                                    featureLayerInfo1.loadInfoTemplate().then(lang.hitch(this, function () {
                                        featureLayerInfo1.disablePopup();
                                    }));
                                }
                            }
                        }
                    }));
                }

            },

        _applyMapExtent: function (stateData, map) {
            // set map extent
            if (!Common.isEmpty(stateData.extent)) {
                map.setExtent(stateData.extent);
            }
        },

        _applyMapGraphics: function (stateData, map) {

            var newGlayer;
            if (map.graphicsLayerIds.length > 0) {
                var gLayers = map.graphicsLayerIds.length;
                var gLayer;
                for (var j = 0; j < gLayers; j++) {
                    gLayer = map.getLayer(map.graphicsLayerIds[0]);
                    if (map.graphicsLayerIds[j] == 'Logic') {
                        newGlayer = map.getLayer(map.graphicsLayerIds[j]);
                        newGlayer.clear();
                    }
                }
            }

            if (stateData.graphicsLayers.features) {
                var graphics = [];
                for (var i = 0, len = stateData.graphicsLayers.features.length ; i < len ; i++) {
                    var json_feat = stateData.graphicsLayers.features[i];
                    var g = new Graphic(json_feat);
                    if (!g)
                        continue;
                    graphics.push(g);
                }

                if (!newGlayer)
                    var newGlayer = new GraphicsLayer({ id: 'Logic' });

                newGlayer.clear();
                for (var j = 0, nb = graphics.length; j < nb; j++) {
                    if (graphics[j])
                        newGlayer.add(graphics[j]);
                }
                map.addLayer(newGlayer);
            }
        },

        _displayLoadSuccessMessage: function (configKey) {
            var msgText = utils.stripHTML(this.nls.msgLoadSuccess);
            msgText = msgText.replace('%mapName%', this.mapName);
            msgText = msgText.replace('%configName%', this._configKey2Name(configKey));
            this.mapstateMsgNode.innerHTML = msgText;
            if (this.shelter) {
                this.shelter.hide();
            }
        },

        _onRestoreBtnClicked: function () {
            console.log('restore to the default view');
            location.reload();
        },

        onMinimize: function () {
            this.resize();
        },

        onMaximize: function () {
            this.resize();
        },

        onClose: function () {
            popup.close(this._saveDialog);
            popup.close(this._loadDialog);
        },

        destroy: function () {
            this._clearResults();
            this.inherited(arguments);
        },

        _clearResults: function () {
            if (this.mapstates)
                this.mapstates = [];

            if (this._advancedSetting)
                this._advancedSetting = null;

            if (this._loadDialogContent)
                this._loadDialogContent = null;

            if (this._loadDialogContent.length > 0)
                this._loadDialogContent = [];

            if (this._loadDialog)
                this._loadDialog = null;

            if (this._saveDialog)
                this._saveDialog = null;

            if (this._saveDialogContent.length > 0)
                this._saveDialogContent = [];

            if (this._operation)
                this._operation = null;

            if (this._mapStateJsonRemote)
                this._mapStateJsonRemote = {};

            if (this._geoprocessor)
                this._geoprocessor = null;

            if (this._printTask)
                this._printTask = null;

            if (this._printTaskParams)
                this._printTaskParams = null;

            if (this._portal)
                this._portal = null;

            if (this._groupsSharedTo.length > 0)
                this._groupsSharedTo = [];

            if (this._individualsSharedTo.length > 0)
                this._individualsSharedTo = [];

            if (this._accessibleGroups.length > 0)
                this._accessibleGroups = [];
        }

        // _composeStoreURL: function (action) {
        //     return this.storeServiceUrl + '/' + action
        //         + '/' + this.userName + '/' + this.map.itemId;
        // }

    });
});