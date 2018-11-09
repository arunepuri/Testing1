define([
    'dojo/_base/array', 
    'dojo/Deferred',
    'dojo/_base/lang'
], function (array, Deferred, lang) {
    return {
        //get ALL USERS for a portal (admin/publisher/user)
        getUsers: function(portal, param){
            var def = new Deferred();
            var users = [];
            portal.queryUsers(param).then(lang.hitch(this, function(items){
                if (items && items.results.length > 0){
                    array.forEach(items.results, lang.hitch(this, function(item){
                        var u = {}; 
                        u.value = item.username; 
                        u.label = item.fullName; // item.username + "(" + (item.fullName) + ")"; 
						
                        users.push(u);
                    })); 
                    def.resolve(users);
                }
            }));
            return def;
        },

        //get ALL GROUPS for a portal (public/org/private accessed)
        getGroups: function(portal, param){
            var def = new Deferred();
            var groups = [];
            portal.queryGroups(param).then(lang.hitch(this, function(items){
                if (items && items.results.length > 0){
                    array.forEach(items.results, lang.hitch(this, function(item){
                        var g = {}; 
                        g.value = item.owner; 
                        g.label = item.title; 
                        groups.push(g);
                    })); 
                    def.resolve(groups); 
                }
            }));
            return def; 
        },

        //get ALL GROUPS in which a user has permissions to access
        getGroupsByUser: function(portal, param){
            var def = new Deferred();
            var groups = [];
            portal.queryUsers(param).then(function(users){
                if (users && users.results.length > 0){
                    users.results[0].getGroups().then(function(groups){
                        array.forEach(groups, function(group){
                            var g = {}; 
                            g.owner = item.owner; 
                            g.title = item.title; 
                            groups.push(g);
                        });
                    });
                    def.resolve(groups); 
                }
            }); 
            return def; 
        },

        getCurrentUser: function(portal){
            return portal.getPortalUser(); 
        }

    };
});