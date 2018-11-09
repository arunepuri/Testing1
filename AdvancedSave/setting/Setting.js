define([
    'dojo/_base/declare',
    'jimu/BaseWidgetSetting',
	'dijit/form/TextBox'
  ],
  function(declare, BaseWidgetSetting, TextBox) {
    return declare([BaseWidgetSetting], {
      baseClass: 'jimu-widget-mapState-setting',

	  projectPreUrlInput: null, 
	  printTaskUrlInput: null, 
        thumbnailImagePathUrlInput: null, 
      sortColumns: [],

      postCreate: function() {
        this.inherited(arguments);
		
		this.projectPreUrlInput = new TextBox({
			style: 'width: 800px;'
		}, this.projectPreUrlInputNode);
		this.printTaskUrlInput = new TextBox({
			style: 'width: 800px;'
		}, this.printTaskUrlInputNode);
		this.thumbnailImagePathUrlInput = new TextBox({
              style: 'width: 800px;'
          }, this.thumbnailImagePathUrlInputNode);
        this.sortColumns = new TextBox({
              style: 'width: 800px;'
        }, this.sortColumnsNode);

		this.projectPreUrlInput.startup(); 
		this.printTaskUrlInput.startup(); 
          
          this.thumbnailImagePathUrlInput.startup();
        this.sortColumns.startup();
      },

      startup: function() {
        this.inherited(arguments);
		this.setConfig(this.config);
      },

      setConfig: function(config) {
        this.config = config;

		this.projectPreUrlInput.setValue(config.gpServiceUrl); 
		this.printTaskUrlInput.setValue(config.exportWebMapUrl);      
        this.thumbnailImagePathUrlInput.setValue(config.thumbnailImagePathUrl); 
        this.sortColumns.setValue(config.sortByOptions);
      },

      getConfig: function() {
		var config = {};
		config["gpServiceUrl"] = this.projectPreUrlInput.getValue(); 
		config["exportWebMapUrl"] = this.printTaskUrlInput.getValue();         
        config["thumbnailImagePathUrl"] = this.thumbnailImagePathUrlInput.getValue(); 
        config["sortByOptions"] = this.sortColumns.getValue(); 
		
        return config;
      }
	  
    });
  });