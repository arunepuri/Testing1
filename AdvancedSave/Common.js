define([
  'dojo/_base/html', 
  'dojo/_base/array', 
  'dojo/_base/lang'
], function (html, array, lang) {
    return {
        isEmpty: function (obj) {
            for (var prop in obj) {
                if (obj.hasOwnProperty(prop))
                    return false;
            }
            return true;
        }, 

        emptyArray: function(array){
            array.length = 0; 
        }, 

        switchNameLabel: function(value, list1, list2){
            switch (value) {
                case list1[0]:
                    return list2[0];
                    break;
                case list1[1]:
                    return list2[1];
                    break;
                case list1[2]:
                    return list2[2];
                    break;
                case list1[3]:
                    return list2[3];
                    break;
            }
        },

        getBase64FromImageUrl: function(imgUrl) {
            var img = new Image(); 
            //This only work if you have the correct permissions
            //Cross-Origin Resource Sharing error appeared if the requested server don't provide Access-Control-Allow-Origin header
            img.setAttribute('crossOrigin', 'anonymous');
            img.src = imgUrl; 
            
            // Create an empty canvas element
            var canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            // Copy the image contents to the canvas
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            // Get the data-URL formatted image
            // Firefox supports PNG and JPEG. You could check img.src to guess the
            // original format, but be aware the using "image/jpg" will re-encode the image.
            var dataURL = canvas.toDataURL("image/png");

            return dataURL.replace(/^data:image\/(png|jpg);base64,/, "");
        },

        removeArrayFromArray: function(array1, array2){
            if(array1 && array2){
                array.forEach(array2, lang.hitch(this, function(item){
                    if(array1.indexOf(item) >= 0)
                        array1.splice(array1.indexOf(item), 1); 
                }));
            }
            return array1; 
        }
        
    };
});
