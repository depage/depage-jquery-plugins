/**
 * @file depage-audio.js
 *
 * Adds a custom audio player, using HTML5 audio element
 *
 * copyright (c) 2006-2012 Frank Hellenkamp [jonas@depage.net]
 *
 * @author Ben Wallis
 */
;(function($){
    if(!$.depage){
        $.depage = {};
    }

    /**
     * Depage Audio
     *
     * @param el
     * @param index - player index
     * @param options
     *
     * @return context
     */
    $.depage.audio = function(el, index, options){
        // {{{ variables
        // To avoid scope issues, use 'base' instead of 'this' to reference this
        // class from internal events and functions.
        var base = this;

        // Access to jQuery and DOM versions of element
        base.$el = $(el);
        base.el = el;

        // Add a reverse reference to the DOM object
        base.$el.data("depage.audio", base);

        // cache selectors
        var $audio = $('audio', base.$el);
        var audio = $audio[0];

        // set the player mode - 'html5' / 'flash' / false (fallback)
        var mode = false;

        // cache the control selectors
        base.controls = {};
        // }}}

        // {{{ init()
        /**
         * Init
         *
         * Setup the options.
         *
         * @return void
         */
        base.init = function(){
            base.options = $.extend({}, $.depage.audio.defaultOptions, options);

            var id = base.options.playerId;

            if (base.el.id) {
                id = base.el.id;
            }

            $.depage.audio.instances.push(base);
        };
        // }}}

        // {{{ audioSupport()
        /**
         * Audio Support
         *
         * Checks browser audio codec support.
         *
         * http://www.modernizr.com/
         *
         * @returns object
         *
         */
        base.audioSupport = function (){
            var support = {};

            try {
                support.wav = audio.canPlayType('audio/wav;').replace(/^no$/,'');
                support.ogg = audio.canPlayType('audio/ogg;').replace(/^no$/,'');
                support.mpeg = audio.canPlayType('audio/mpeg;').replace(/^no$/,'');
                support.mp3 = audio.canPlayType('audio/mp3;').replace(/^no$/,'');
                support.mp4 = audio.canPlayType('audio/mp4;').replace(/^no$/,'');
            } catch(e) { }
            finally{
                // TODO flash support
                support.flash = false; // TODO $.depage.flash({requiredVersion:"9,0,115"}).detect();
            }

            return support;
        };
        // }}}

        // {{{ audio()
        /**
         * Audio
         *
         * Entry point to build the audio player.
         *  - Build the controls
         *  - Autoloads
         *
         * @return void
         */
        base.audio = function() {
            if (base.$el.data("initialized")) {
                return;
            }
            var support = base.audioSupport();

            // SET TO DEBUG FLASH MODE
            // support = { 'flash' : true };

            // determine the supported player mode - flash or html5
            if ( support.mp3 && $('source[type="audio/mp3"]', audio).length > 0 ||
                support.ogg && $('source[type="audio/ogg"]', audio).length > 0 || 
                support.wav && $('source[type="audio/wav"]', audio).length > 0 ||
                support.mp4 && $('source[type="audio/mp4"]', audio).length > 0 ||
                support.mpeg && $('source[type="audio/mpeg"]', audio).length > 0) {
                mode = 'html5';
                base.player = audio;
                base.html5.setup();
            } else {
                // fallback
                return false;
            }

            var div = $("<div class=\"controls\"></div>");
            if (base.options.useCustomControls) {
                base.addControls(div);
            } else {
                $audio.attr("controls", "true");
            }
            base.addLegend(div);
            div.appendTo(base.$el);

            base.$el.data("initialized", true);
            base.$el.trigger("initialized");
        };
        // }}}

        /**
         * Namespace HTML5 funcitons
         */
        base.html5 = {
            // {{{ setup
            /**
             * HTML5 Setup the handlers for the HTML5 audio
             *
             * @return void
             */
            setup : function() {
                // attribute fixes issue with IE9 poster not displaying - add in html
                // $audio.attr('preload', 'none');

                $audio.on("play", function(){
                    base.onPlay();
                });

                $audio.on("pause", function(){
                    base.onPause();
                });

                $audio.on("timeupdate", function(){
                    base.setCurrentTime(this.currentTime);
                    base.duration(audio.duration);
                });

                $audio.on("ended", function(){
                    base.end();
                });

                /**
                 * HTML5 Progress Event
                 *
                 * Fired when buffering
                 *
                 * @return false
                 */
                $audio.on("progress", function(){
                    var defer = null;
                    var progress = function(){
                        var loaded = 0;
                        if (audio.buffered && audio.buffered.length > 0 && audio.buffered.end && typeof audio.duration != 'undefined') {
                            loaded = audio.buffered.end(audio.buffered.length-1) / audio.duration;
                        }
                        // for browsers not supporting buffered.end (e.g., FF3.6 and Safari 5)
                        else if (typeof(audio.bytesTotal) !== 'undefined' && audio.bytesTotal > 0 &&
                                 typeof(audio.bufferedBytes) !== 'undefined') {
                            loaded = audio.bufferedBytes / audio.bytesTotal;
                        }

                        base.percentLoaded(loaded);

                        // last progress event not fired in all browsers
                        if ( !defer && loaded < 1 ) {
                            defer = setInterval(function(){ progress(); }, 1500);
                        }
                        else if (loaded >= 1) {
                             clearInterval(defer);
                        }
                    };

                    progress();
                });

                /**
                 * HTML5 Loaded Data Event
                 *
                 * Fired when the player is fully loaded
                 *
                 * TODO doesn't always seem to fire?
                 *
                 * @return false
                 */
                $audio.on("loadeddata", function(){
                    base.percentLoaded(1);
                });

                /**
                 * HTML5 Waiting Event
                 *
                 * Fired when the player stops becasue the next frame is not buffered.
                 *
                 * Display a buffering image if available.
                 *
                 * @return void
                 */
                $audio.on("waiting", function(){
                    base.html5.$buffer_image.show();
                });

                /**
                 * HTML5 Playing Event
                 *
                 * Fired when the playback starts after pausing or buffering.
                 *
                 * Clear the buffering image.
                 *
                 * @return void
                 */
                $audio.on("playing", function(){
                    base.html5.$buffer_image.hide();
                });


                /**
                 * HTML5 Seek
                 *
                 * Create a seek method for the html5 player
                 *
                 * @param offset - current time;
                 *
                 * @return false
                 */
                base.player.seek = function(offset){
                    if (offset <= 0) {
                        offset = 0.1;
                    }
                    if (offset > audio.duration) {
                        offset = audio.duration;
                    }
                    base.player.currentTime = offset;
                    return false;
                };
            }
            // }}}
        };

        // {{{ addLegend()
        /**
         * Add Legend-Wrapper
         *
         * @return void
         */
        base.addLegend = function(div){
            var $requirements = $("p.requirements", base.$el);
            var $legend = $("p.legend", base.$el).show();

            $legend.clone().appendTo(div);

            $legend.hide();
            $requirements.hide();

            return div;
        };
        // }}}
        // {{{ addControls()
        /**
         * Add Controls
         *
         * Adds player controls
         *
         * @return void
         */
        base.addControls = function(div){
            var imgSuffix = base.options.imageSuffix;

            $audio.removeAttr("controls");

            base.controls.progress = $("<span class=\"progress\" />")
                .mouseup(function(e) {
                    var offset = (e.pageX - $(this).offset().left) / $(this).width() * audio.duration;
                    base.player.seek(offset);
                });
            base.controls.buffer = $("<span class=\"buffer\"></span>")
                .appendTo(base.controls.progress);

            base.controls.position = $("<span class=\"position\"></span>")
                .appendTo(base.controls.progress)
                .on('dragstart', function(e) {
                    // mouse drag
                    var $progress = $('.progress');
                    var offset = $progress.offset().left;
                    var width = $progress.width();
                    $(this).on('drag.seek', function(e) {
                        // TODO not firing in firefox!
                        if (e.pageX > 0) { // TODO HACK last drag event in chrome fires pageX = 0?
                            var position = (e.pageX - offset) / width * audio.duration;
                            // console.log(position);
                            base.player.seek(position);
                        }
                    });
                })
                .on('dragend', function(e) {
                    $(this).off('drag.seek');
                    return false;
                });

            base.controls.progress.appendTo(div);

            base.controls.play = $("<a class=\"play\"><img src=\"" + base.options.assetPath + "icon-play" + imgSuffix + "\" alt=\"play\"></a>")
                .appendTo(div)
                .click(function() {
                    base.player.play();
                    return false;
                });

            base.controls.pause = $("<a class=\"pause\" style=\"display: none\"><img src=\"" + base.options.assetPath + "icon-pause" + imgSuffix + "\" alt=\"pause\"></a>")
                .appendTo(div)
                .click(function() {
                    base.player.pause();
                    return false;
                });

            base.controls.rewind = $("<a class=\"rewind\"><img src=\"" + base.options.assetPath + "icon-rewind" + imgSuffix + "\" alt=\"rewind\"></a>")
                .appendTo(div)
                .click(function() {
                    base.player.seek(0.1); // setting to zero breaks iOS 3.2
                    return false;
                });

            base.controls.time = $("<span class=\"time\" />");

            base.controls.current = $("<span class=\"current\">00:00</span>")
                .appendTo(base.controls.time);

            base.controls.duration = $("<span class=\"duration\"></span>")
                .appendTo(base.controls.time);

            base.controls.time.appendTo(div);

            base.html5.$buffer_image = $('<img class="buffer-image" />').attr('src', base.options.assetPath + 'buffering_indicator.gif').hide();
            base.$el.append(base.html5.$buffer_image);
        };
        // }}}

        // {{{ onPlay()
        /**
         * Play
         *
         * @return void
         */
        base.onPlay = function() {
            base.$el.addClass("playing");

            if (base.options.useCustomControls){
                base.controls.play.hide();
                base.controls.pause.show();
                base.controls.rewind.show();
            }

            $.each($.depage.audio.instances, function(index, player) {
                if (player != base) {
                    player.pause();
                }
            });

            if (typeof base.options.onPlay == 'function') {
                base.options.onPlay();
            }
            base.$el.trigger("play");
        };
        // }}}
        // {{{ onPause()
        /**
         * Pause
         *
         * @return void
         */
        base.onPause = function() {
            base.$el.removeClass("playing");

            if (base.options.useCustomControls){
                base.controls.play.show();
                base.controls.pause.hide();
                base.controls.rewind.show();
            }

            if (typeof base.options.onPause == 'function') {
                base.options.onPause();
            }
            base.$el.trigger("pause");
        };
        // }}}
        // {{{ end()
        /**
         * End
         *
         * @return void
         */
        base.end = function() {
            base.pause();

            if (typeof base.options.onEnd == 'function') {
                base.options.onEnd();
            }
            base.$el.trigger("ended");
        };
        // }}}

        // {{{ setCurrentTime()
        /**
         * Set Current Time
         *
         * @return void
         */
        base.setCurrentTime = function(currentTime) {
            base.controls.current.html(base.floatToTime(currentTime) + "/");
            base.controls.position.width(Math.min(currentTime / audio.duration * 100, 100) + "%");

            base.$el.trigger("timeupdate");
        };
        // }}}

        // {{{ percentLoaded()
        /**
         * Percent Loaded
         *
         *
         * @param percentLoaded
         *
         * @return void
         */
        base.percentLoaded = function(percentLoaded){
            base.controls.buffer.width(Math.min(percentLoaded * 100, 100) + "%");
        };
        // }}}

        // {{{ duration()
        /**
         * Duration
         *
         * @param duration
         *
         */
        base.duration = function(duration) {
            base.controls.duration.html(base.floatToTime(duration));
        };
        // }}}

        // {{{ floatToTime()
        /**
         * FloatToTime
         *
         * Converts to a float time to a string for display
         *
         * @param value
         *
         * @return string - "MM:SS"
         */
        base.floatToTime = function(value) {
            var mins = String("00" + Math.floor(value / 60)).slice(-2);
            var secs = String("00" + Math.floor(value) % 60).slice(-2);

            return mins + ":" + secs;
        };
        // }}}

        // {{{ play()
        /**
         * play
         *
         * @return void
         */
        base.play = function() {
            base.player.play();

            if ( typeof window._paq !== 'undefined' ) {
                window._paq.push(['trackEvent', 'MediaAudio', 'Play', $("p.legend", base.$el).text()]);
            }
        };
        // }}}

        // {{{ pause()
        /**
         * pause
         *
         * @return void
         */
        base.pause = function() {
            base.player.pause();
        };
        // }}}

        // Run initializer
        base.init();

        // Build the audio
        base.audio();

        return base;
    };

    /**
     * instances
     *
     * Holds all player instances by id
     */
    $.depage.audio.instances = [];

    var $scriptElement = $("script[src *= '/depage-player.js']");
    var basePath = "";
    if ($scriptElement.length > 0) {
        basePath = $scriptElement[0].src.match(/^.*\//).toString();
    }

    /**
     * Options
     *
     * @param assetPath - path to the asset-folder (with flash-player and images for buttons)
     * @param playerId
     * @param width - audio width
     * @param debug - if set, the flash player will send console.log messages for his actions
     * @param onPlay - pass callback function to trigger on play event
     * @param onPause - pass callback function to trigger on pause event
     * @param onEnd - pass callback function to trigger on end play event
     */
    $.depage.audio.defaultOptions = {
        assetPath : basePath + "depage_audio/",
        imageSuffix : ".png",
        playerId : "dpAudio",
        useCustomControls: true,
        debug: false,
        onPlay: false,
        onPause: false,
        onEnd: false
    };

    $.fn.depageAudio = function(options){
        return this.each(function(index){
            (new $.depage.audio(this, index, options));
        });
    };

})(jQuery);
/* vim:set ft=javascript sw=4 sts=4 fdm=marker : */
