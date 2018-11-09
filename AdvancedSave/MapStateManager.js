define([
  'dojo/_base/declare',
  'esri/request',
  'dojo/promise/all',
  'dojo/_base/lang',
  'dojo/_base/array',
  'dojo/Deferred',
  'dojo/json',
  'esri/geometry/Extent',
  'esri/SpatialReference',
  './Common',
  'libs/storejs/store',
  'libs/md5/md5',
  'jimu/tokenUtils'
], function (declare, esriRequest, all, lang, array, Deferred,
    json, Extent, SpatialReference, Common, storejs, md5js, TokenUtils) {
    var instance = null;
    var clazz = declare(null, {
        mapMd5: null,
        mapStateKey: null,
        bhpTaggedLayer: 'bhpSelectLayer',

        _getMapStateMd5: function (map) {
            if (typeof this.mapMd5 === 'string') {
                return this.mapMd5;
            } else {
                var str = json.stringify(map);
                this.mapMd5 = md5js(str);
                return this.mapMd5;
            }
        },

        _getMapStateKey: function () {
            if (this.mapStateKey) {
                return this.mapStateKey;
            }

            this.mapStateKey = 'mapstate_' + this.token || window.path;
            return this.mapStateKey;
        },

        _prepareMapState: function (mapState) {
            var data = {};

            var extent = mapState.map && mapState.map.extent;
            if (!Common.isEmpty(extent)) {
                data.extent = new Extent(
                  extent.xmin,
                  extent.ymin,
                  extent.xmax,
                  extent.ymax,
                  new SpatialReference(extent.spatialReference)
                );
            }
            else {
                data.extent = {};
            }

            var layers = mapState.map && mapState.map.layers;
            if (layers) {
                data.layers = layers;
            }

            data.configName = mapState.configName;
			data.configDespt = mapState.configDespt; 
            data.configOwner = mapState.configOwner;
            data.configAccess = mapState.configAccess;
            data.webMapOwner = mapState.webMapOwner;
            data.webMapAccess = mapState.webMapAccess;
            data.thumbnailUrl = mapState.thumbnailUrl;
            data.name = mapState.name;
            data.updateDate = mapState.updateDate;
            data.graphicsLayers = mapState.map.graphicsLayers;
            data.layerDef = mapState.map.layerDef;
            data.customBaseMaps = mapState.map.customBaseMaps;
            data.dynamicData = mapState.map.dynamicData;

            return data;
        },

        getMapState: function () {
            var def = new Deferred();
            var mapStateArray = [];
            var mapState = {};

            var mapStateKey = this._getMapStateKey();
            var mapStates = storejs.get(mapStateKey);

            if (mapStates && mapStates.mapstates.length > 0) {
                array.forEach(mapStates.mapstates, lang.hitch(this, function (item) {
                    if (item.mapStateMd5 === this._getMapStateMd5()) {
                        mapState = this._prepareMapState(item);
                        mapStateArray.push(mapState);
                    }
                }));
            }

            def.resolve(mapStateArray);

            return def;
        },

        _getCurrentLayerFilter: function (layerInfo) {
            try {
                var result = [];

                if (layerInfo.layerType == 'ArcGISMapServiceLayer') {
                    if (layerInfo.layerObject) {
                        if (layerInfo.layerObject.layerDefinitions) {
                            result = layerInfo.layerObject.layerDefinitions;
                        }
                    }
                } else if (layerInfo.layerType == 'WMS') {
                    return undefined
                } else if (layerInfo.layerObject.getDefinitionExpression()) {
                    result.push(layerInfo.layerObject.getDefinitionExpression());
                }

                return result;
            }
            catch (err) {
                console.log(err);
                return undefined
            }
        },

        _extractMapState: function (map, layerInfosObj, checkedpreferences, configName, thumbnailUrl, userName, configAccess, configDespt) {
            if (!map) {
                return null;
            }

            var _extent = {};
            if (checkedpreferences.indexOf('extent') >= 0) {
                _extent = {
                    xmin: map.extent.xmin,
                    xmax: map.extent.xmax,
                    ymin: map.extent.ymin,
                    ymax: map.extent.ymax,
                    spatialReference: {
                        wkid: map.extent.spatialReference.wkid,
                        wkt: map.extent.spatialReference.wkt
                    }
                };
            }

            var mapObj = {
                mapId: map.itemId,
                extent: _extent,
                layers: {},
                layerDef: {},
                graphicsLayers: {},
                customBaseMaps: [],
                dynamicData: {}
            };

            // layers
            if (checkedpreferences.indexOf('layers') >= 0) {
                if (layerInfosObj && layerInfosObj.traversal) {
                    layerInfosObj.traversal(lang.hitch(this, function (layerInfo) {
                        mapObj.layers[layerInfo.id] = {
                            visible: layerInfo.isVisible(),
                            opacity: layerInfo.getOpacity(),
                            enablePopup: layerInfo.controlPopupInfo.enablePopup, //*** to enbale popup
                            layerDefinitions: layerInfo.layerObject.layerDefinitions
                        };
                    }));
                }
            }

            // layer defs
            if (checkedpreferences.indexOf('layerDef') >= 0) {
                array.forEach(map.itemInfo.itemData.operationalLayers, lang.hitch(this, function (rootLayerInfo) {
                    mapObj.layerDef[rootLayerInfo.id] = {
                        defnExpr: this._getCurrentLayerFilter(rootLayerInfo)
                    };

                }), this);
            }

            // dynamic data
            var map_Operational_Ids = array.map(map.itemInfo.itemData.operationalLayers, function (item) { return item.id; });
            var userbasemaps = array.filter(map.layerIds, function (layer, i) {
                if (map_Operational_Ids.indexOf(layer) == -1) {
                    return layer;
                }
            });

            this.getLayerTypes = [];
            this.getLayerTypes_id = [];

            array.forEach(userbasemaps, lang.hitch(this, function (userbasemap) {
                var obj_basemap = map.getLayer(userbasemap);
                try {
                    if (obj_basemap._basemapGalleryLayerType != undefined) {
                        var item = {
                            'url': obj_basemap.url,
                            'type': obj_basemap._basemapGalleryLayerType
                        };
                        mapObj.customBaseMaps.push(item);
                    }                
                }
                catch (err) {
                    console.log(err);
                }

            }));

            //***
            if (layerInfosObj && layerInfosObj.traversal) {
                layerInfosObj.traversal(lang.hitch(this, function (layerInfo) {
                                /*if (layerInfo.id == obj_basemap.id){
									this.mapObj.dynamicData[layerInfo.id] = {
										
										visible: layerInfo.isVisible(),
										opacity: layerInfo.getOpacity(),
										layerDefinitions: layerInfo.layerObject.layerDefinitions,
										url: layerInfo.layerObject.url,
										type:layerInfo.originOperLayer.layerType,
										title:layerInfo.layerObject.name,
										visibleLayers:layerInfo.layerObject.visibleLayers
									};
								}
								else*/ if (layerInfo.parentLayerInfo != undefined) {
                        var t = 'T';
                        mapObj.dynamicData[layerInfo.id] = {
                            visible: layerInfo.isVisible(),
                            opacity: layerInfo.getOpacity(),
                            enablePopup: layerInfo.controlPopupInfo.enablePopup, //*** to enbale popup
                            layerDefinitions: layerInfo.layerObject.layerDefinitions
                        }
                    }
                    else {
                        var t = 'T';
                        if (this.getLayerTypes_id.indexOf(layerInfo.id) < 0) {
                            this.getLayerTypes.push(layerInfo.getLayerType());
                            this.getLayerTypes_id.push(layerInfo.id);
                        }
                        mapObj.dynamicData[layerInfo.id] = {
                            visible: layerInfo.isVisible(),
                            opacity: layerInfo.getOpacity(),
                            enablePopup: layerInfo.controlPopupInfo.enablePopup, //*** to enbale popup
                            layerDefinitions: layerInfo.layerObject.layerDefinitions,
                            url: layerInfo.layerObject.url,
                            type: layerInfo.originOperLayer.layerType,
                            title: layerInfo.layerObject.name,
                            visibleLayers: layerInfo.layerObject.visibleLayers
                        }
                    }
                }));
            }
                        /*var item = {
						 'url': obj_basemap.url,
						 'visibility':obj_basemap.visibility
						};
						this.mapObj.dynamicData.push(item);*/

            all(this.getLayerTypes).then(lang.hitch(this, function (results) {
                console.log(results);
                for (i = 0; i < results.length; i++) {
                    mapObj.dynamicData[this.getLayerTypes_id[i]].type = results[i];
                }
            }));

            var content = {
                'features': []
            };

            // graphics Layers
            if (checkedpreferences.indexOf('graphicsLayers') >= 0) {
                if (map.graphicsLayerIds.length > 0) {
                    var gLayers = map.graphicsLayerIds.length;
                    for (var j = 0; j < gLayers; j++) {
                        //if(map.graphicsLayerIds[j] == 'Logic')
                        //	continue;

                        if (map.getLayer(map.graphicsLayerIds[j]).type === 'Feature Layer')
                            continue;

                        //var taggedlayer = new RegExp(this.taggedGraphicsLayer, 'i');
                        if (map.getLayer(map.graphicsLayerIds[j]).id.indexOf(this.bhpTaggedLayer) > -1)
                            continue;

                        //if (!map.graphicsLayerIds[j].match(taggedlayer) && map.getLayer(map.graphicsLayerIds[j]).type != 'Feature Layer') {
                        var nb_graphics = map.getLayer(map.graphicsLayerIds[j]).graphics.length;

                        var graphics = map.getLayer(map.graphicsLayerIds[j]).graphics;
                        for (var i = 0; i < nb_graphics; i++) {
                            var g = graphics[i];
                            if (g) {
                                var json = g.toJson();
                                content['features'].push(json);
                            }
                        }
                    }
                }

                if (map.graphics.graphics.length > 0) {
                    var nb_graphics = map.graphics.graphics.length;
                    var graphics = map.graphics.graphics;
                    for (var i = 0; i < nb_graphics; i++) {
                        var g = graphics[i];
                        if (g && g.visible) {
                            var json = g.toJson();
                            content['features'].push(json);
                        }
                    }
                }
            }

            if (content.features.length > 0) {
                mapObj.graphicsLayers = content;
            }

            var now = new Date();
            //Added logic to avoid unicode issue in Internet explore
            var strLocalNow = now.toLocaleString().replace(/[^a-zA-Z0-9/: ]+/g, "");

            return {
                configName: configName,
				configDespt: configDespt, 
                configOwner: userName,
                configAccess: configAccess,
                webMapOwner: map.itemInfo.item.owner,
                webMapAccess: map.itemInfo.item.access,
                thumbnailUrl: thumbnailUrl,
                updateDate: strLocalNow,
                lastOpened: Number(now),
                map: mapObj,
                mapStateMd5: this._getMapStateMd5()
            };
        },

        _generateMapState: function (dataStore) {
            if (dataStore.storeStrategy === 'remote')
                var mapStatesJson = dataStore.mapStateJsonRemote;
            else {
                var mapStateKey = this._getMapStateKey();
                var mapStatesJson = storejs.get(mapStateKey);
            }

            if (mapStatesJson.mapstates) {
                switch (dataStore.operation) {
                    case 'new':
                        mapStatesJson.mapstates.push(this._extractMapState(dataStore.map, dataStore.layerInfosObj, dataStore.checkedPreferences, dataStore.configName, dataStore.thumbnailUrl, dataStore.configOwner, dataStore.configAccess, dataStore.configDespt));
                        break;
                    case 'update':
                        mapStatesJson = this.spliceConfigFromMapState(mapStatesJson, dataStore.configName, dataStore.configOwner);
                        mapStatesJson.mapstates.push(this._extractMapState(dataStore.map, dataStore.layerInfosObj, dataStore.checkedPreferences, dataStore.configName, dataStore.thumbnailUrl, dataStore.configOwner, dataStore.configAccess, dataStore.configDespt));
                        break;
                    case 'delete':
                        mapStatesJson = this.spliceConfigFromMapState(mapStatesJson, dataStore.configName, dataStore.configOwner);
                }
            }
            else {
                var mapStatesJson = {};
                var mapStates = [];

                mapStates.push(this._extractMapState(dataStore.map, dataStore.layerInfosObj, dataStore.checkedPreferences, dataStore.configName, dataStore.thumbnailUrl, dataStore.configOwner, dataStore.configAccess, dataStore.configDespt));
                mapStatesJson.mapstates = mapStates;
            }

            return mapStatesJson;
        },

        spliceConfigFromMapState: function (mapStatesJson, configName, configOwner) {

            var configNameLowerCase = configName.toLowerCase();

            for (var i = mapStatesJson.mapstates.length - 1; i > (-1) ; i--) {
                if (mapStatesJson.mapstates[i] && (mapStatesJson.mapstates[i].configName.toLowerCase() === configNameLowerCase) && (mapStatesJson.mapstates[i].configOwner === configOwner)) {
                    mapStatesJson.mapstates.splice(i, 1);
                }
            }

            return mapStatesJson;
        },

        updateMapStateLastOpenedDate: function (mapStatesJson, configName, configOwner) {

            var configNameLowerCase = configName.toLowerCase();

            for (var i = 0; i < mapStatesJson.mapstates.length; i++) {
                if (mapStatesJson.mapstates[i] && (mapStatesJson.mapstates[i].configName.toLowerCase() === configNameLowerCase) && (mapStatesJson.mapstates[i].configOwner === configOwner)) {
                    mapStatesJson.mapstates[i].lastOpened = Number(new Date());
                    return mapStatesJson;
                }
            }

            return null;
        },

        saveMapState: function (dataStore) {
            var mapStatesJson = this._generateMapState(dataStore);

            if (mapStatesJson) {
                var key = this._getMapStateKey();
                storejs.set(key, mapStatesJson);
            }
        }
    });

    clazz.getInstance = function (token) {
        if (instance === null) {
            instance = new clazz();
        }
        instance.token = token;
        return instance;
    };

    return clazz;
});