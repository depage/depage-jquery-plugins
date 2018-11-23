/**
 * @require framework/shared/jquery-1.4.2.js
 * @require framework/shared/jquery.hammer.js
 *
 * @file    depage-magaziner.js
 *
 * adds a magazine like navigation to a website
 *
 *
 * copyright (c) 2013 Frank Hellenkamp [jonas@depage.net]
 *
 * @author    Frank Hellenkamp [jonas@depage.net]
 **/
;(function($){
    "use strict";
    /*jslint browser: true*/
    /*global $:false History:false reinvigorate:false */

    // @todo update magaziner not to add all pages but only keep three current pages and add on request

    if(!$.depage){
        $.depage = {};
    }

    var baseUrl = $("head base").attr("href") || false;
    if (baseUrl.charAt(baseUrl.length - 1) != "/") {
        baseUrl += "/";
    }
    var rootUrl = baseUrl || window.location.href;
    var History = window.history;

    // holds page-numbers by urls
    var pagesByUrl = [];
    var urlsByPages = [];
    var pageScrolling = false;
    var pageScrollingTimeout;
    var pageHtml = "<div class=\"page\"></div>";

    // {{{ HTML Helper
    var documentHtml = function(html){
        // Prepare
        var result = String(html)
            .replace(/<\!DOCTYPE[^>]*>(\n)?/i, '')
            .replace(/<(body)[\s]class="([^"]*)"([\s\>])/gi,'<div class="document-$1 $2"$3')
            .replace(/<(html|head|body|title|meta|script)([\s\>])/gi,'<div class="document-$1"$2')
            .replace(/<\/(html|head|body|title|meta|script)\>/gi,'</div>')
        ;

        return result;
    };
    // }}}
    // {{{ makeAbsolute
    function makeAbsolute(base, relative) {
        if (baseUrl) {
            return baseUrl + relative;
        } else {
            var stack = base.split("/"),
                parts = relative.split("/");
            stack.pop(); // remove current file name (or empty string)
                        // (omit if "base" is the current folder without trailing slash)
            for (var i=0; i<parts.length; i++) {
                if (parts[i] == ".")
                    continue;
                if (parts[i] == "..")
                    stack.pop();
                else
                    stack.push(parts[i]);
            }
            return stack.join("/");
        }
    }
    // }}}
    // {{{ hasTouch
    var hasTouch = (function() {
        return 'ontouchstart' in window ||  // works on most browsers
            navigator.maxTouchPoints;       // works on IE10/11 and Surface
    })();
    // }}}
    // {{{ hasCssVariables
    var hasCssVariables = (function() {
        return window.CSS && window.CSS.supports && window.CSS.supports('--fake-var', 0);
    })();
    // }}}

    $.depage.magaziner = function(el, pagelinkSelector, options){
        if (typeof History == 'undefined') {
            return;
        }

        // {{{ variables
        // To avoid scope issues, use 'base' instead of 'this' to reference this class from internal events and functions.
        var base = this;

        // Access to jQuery and DOM versions of element
        base.$el = $(el);
        base.el = el;

        // Add a reverse reference to the DOM object
        base.$el.data("depage.magaziner", base);

        // jquery object of body
        var $body = $("body");
        var $window = $(window);
        var $document = $(document);

        var capabilities = "";
        if (hasTouch) {
            capabilities += " has-touch";
        } else {
            capabilities += " no-touch";
        }
        if (hasCssVariables) {
            capabilities += " has-css-variables";
        }
        $("html").addClass(capabilities);

        // width of one page
        var pageWidth = base.$el.width();

        // speed for animations
        var speed = 500;

        // global hammer options to drag only in one direction
        delete Hammer.defaults.cssProps.userSelect;
        var hammerOptions = {
            threshold: 20,
            direction: Hammer.DIRECTION_VERTICAL
        };
        var scrollTop;

        // get the currently loaded page
        base.currentPage = -1;
        var $currentPage = null;
        var $prevPage = null;
        var $nextPage = null;
        // }}}

        // {{{ jquery.internal expression helper
        $.expr[':'].internal = function(obj, index, meta, stack){
            var url = $(obj).attr('href') || $(obj).attr('src') || '';

            if (url.substr(-4) == ".pdf") return false;

            // Check link
            return url.substring(0, rootUrl.length) === rootUrl || url.indexOf(':') === -1;
        };
        // }}}
        // {{{ jquery.ajaxify Helper
        $.fn.ajaxify = function() {
            var $this = $(this);

            // Ajaxify
            $this.find('a:internal:not(.no-ajaxy)').each(function(){
                // Prepare
                var
                    $a = $(this),
                    url = this.href,
                    urlPath,
                    title = $a.attr('title') || null,
                    hash;

                if (typeof $a.attr('href') == 'undefined') return;

                // make links absolute;
                $a.attr("href", url);

                urlPath = url.replace(/#.*/, '');
                hash = this.hash;

                $a.on("click", function(e) {
                    // Continue as normal for cmd clicks etc
                    if ( e.which == 2 || e.metaKey ) { return true; }

                    if (typeof pagesByUrl[urlPath] !== 'undefined') {
                        base.show(pagesByUrl[urlPath], true, hash);
                        return e.preventDefault();
                    } else {
                        base.load(url);
                        return e.preventDefault();
                    }
                });
            });

            // Chain
            return $this;
        };
        // }}}

        // {{{ init()
        base.init = function() {
            base.options = $.extend({},$.depage.magaziner.defaultOptions, options);

            $currentPage = $(".page").addClass("current-page");
            base.initPageLinks();

            base.registerEvents();
            $body.ajaxify();

            var beforeHtml = "";
            var afterHtml = "";

            $currentPage
                .data("loaded", true)
                .data("loading", false)
                .data("classes", $body.attr("class"))
                .data("title", document.title);

            $prevPage = base.getNewPage();
            $nextPage = base.getNewPage();

            base.$el.trigger("depage.magaziner.initialized");

            base.show(base.currentPage);

            base.preloadPageByNumber(base.currentPage - 1);
            base.preloadPageByNumber(base.currentPage + 1);
        };
        // }}}
        // {{{ initPageLinks
        base.initPageLinks = function() {
            var $pagelinks = $(pagelinkSelector);
            pagesByUrl = [];
            urlsByPages = [];

            for (var i = 0, n = 0; i < $pagelinks.length; i++) {
                var url = $pagelinks[i].href;
                if ($pagelinks.eq(i).attr("href") === "") {
                    // normalize empty links that go to current page for IE
                    url = document.location.href;
                }

                url = url.replace(/#.*/, '');

                if (typeof pagesByUrl[url] == 'undefined') {
                    pagesByUrl[url] = n;
                    urlsByPages[n] = url;
                    n++;
                }
            }
            var currentLocation = document.location.href.replace(/#.*/, '');
            if (typeof pagesByUrl[currentLocation] == 'undefined') {
                base.currentPage = -1;
            } else {
                base.currentPage = pagesByUrl[currentLocation];
            }
        };
        // }}}
        // {{{ registerEvents()
        base.registerEvents = function() {
            // {{{ horizontal scrolling between pages
            base.$el.hammer(hammerOptions).on("panleft panright", function(e) {
                if (e.gesture.pointerType == "mouse" || pageScrolling) {
                    return;
                }
                $prevPage.removeClass("animated");
                $currentPage.removeClass("animated");
                $nextPage.removeClass("animated");

                base.setPagePos($prevPage, -1 * pageWidth + e.gesture.deltaX);
                base.setPagePos($currentPage, e.gesture.deltaX);
                base.setPagePos($nextPage, 1 * pageWidth + e.gesture.deltaX);
            });
            // }}}
            // {{{ dragend actions after horizontal or vertical scrolling
            base.$el.hammer(hammerOptions).on("panend", function(e) {
                if (e.gesture.pointerType == "mouse" || pageScrolling) {
                    return;
                }
                var newXOffset = 0;
                var newYOffset = 0;
                var minVelocity = 0.1;
                var minMovement = pageWidth / 7;

                if (e.gesture.deltaX < - minMovement || (e.gesture.deltaX < 0 && e.gesture.velocityX > minVelocity)) {
                    base.next();
                } else if (e.gesture.deltaX > minMovement || (e.gesture.deltaX > 0 && e.gesture.velocityX > minVelocity)) {
                    base.prev();
                } else {
                    base.show(base.currentPage);
                }
            });
            // }}}
            // {{{ key events
            $document.on("keydown", function(e) {
                // @todo fixed keyboard repeat
                if ($(document.activeElement).is(':input')){
                    // continue only if an input is not the focus
                    return true;
                }
                if (e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) {
                    return true;
                }
                switch (parseInt(e.which || e.keyCode, 10)) {
                    case 39 : // cursor right
                    case 76 : // vim nav: l
                        base.next();
                        e.preventDefault();
                        break;
                    case 37 : // cursor left
                    case 72 : // vim nav: h
                        base.prev();
                        e.preventDefault();
                        break;
                    case 40 : // cursor down
                    case 74 : // vim nav: j
                        $currentPage.scrollTop($currentPage.scrollTop() + 50);
                        e.preventDefault();
                        break;
                    case 38 : // cursor up
                    case 75 : // vim nav: k
                        $currentPage.scrollTop($currentPage.scrollTop() - 50);
                        e.preventDefault();
                        break;
                }
            });
            // }}}

            // {{{ resize event
            var onResize =  function() {
                pageWidth = base.$el.width();
                base.show(base.currentPage, false);
            };

            $window.on("resize", function() {
                setTimeout( onResize, 200 );
            });
            // }}}

            // {{{ popstate event
            $window.on("popstate", function() {
                var
                    url = window.location.href,
                    relativeUrl = url.replace(rootUrl,'');

                if (typeof pagesByUrl[url] !== 'undefined') {
                    base.show(pagesByUrl[url], true);
                } else {
                    base.load(url);
                }
            });
            // }}}
            // {{{ statechangecomplete event
            base.$el.on("depage.magaziner.statechangecomplete", function(url, $page) {
                var
                    title = $currentPage.data("title");

                if (title) {
                    // Update the title
                    document.title = title;
                    try {
                        document.getElementsByTagName('title')[0].innerHTML = document.title.replace('<','&lt;').replace('>','&gt;').replace(' & ',' &amp; ');
                    }
                    catch ( Exception ) { }
                }

                $body.attr("class", $currentPage.data("classes"));

                base.initPageLinks();

                // Inform Google Analytics of the change
                if ( typeof window._gaq !== 'undefined' ) {
                    window._gaq.push(['_trackPageview', url]);
                }

                // Inform ReInvigorate of a state change
                if ( typeof window.reinvigorate !== 'undefined' && typeof window.reinvigorate.ajax_track !== 'undefined' ) {
                    reinvigorate.ajax_track(url);
                    // ^ we use the full url here as that is what reinvigorate supports
                }

                // Inform piwik of the change
                if ( typeof window._paq !== 'undefined' ) {
                    window._paq.push(['trackPageView', url]);
                }
            });
            // }}}
        };
        // }}}

        // {{{ triggerShowLoaded()
        base.triggerShowLoaded = function(url, $page) {
            if (url === window.location.href) {
                base.$el.trigger("depage.magaziner.statechangecomplete", [url, $page]);
            }
        };
        // }}}
        // {{{ resetScroll()
        base.resetScroll = function() {
            $prevPage.scrollTop(0);
            $nextPage.scrollTop(0);
        };
        // }}}
        // {{{ getPageByNumber
        base.getPageByNumber = function(n) {
            var $page;

            if (n == base.currentPage) {
                $page = $currentPage;
            } else if (n == base.currentPage - 1) {
                $page = $prevPage;
            } else if (n == base.currentPage + 1) {
                $page = $nextPage;
            }

            return $page;
        };
        // }}}
        // {{{ preloadPageByNumber()
        base.preloadPageByNumber = function(n) {
            if (n < 0 || n >= urlsByPages.length) {
                return;
            }
            var url = urlsByPages[n];

            if (typeof url === 'undefined') {
                return;
            }

            // get page element for current url
            var $page = base.getPageByNumber(n);

            base.preloadPage($page, url);
        };
        // }}}
        // {{{ preloadPage()
        base.preloadPage = function($page, url) {
            if (!$page) {
                return true;
            } else if ($page.data("loaded")) {
                base.triggerShowLoaded(url, $page);

                return true;
            } else if ($page.data("loading")) {
                return true;
            }

            $page
                .data("loading", true);

            setTimeout(function() {
                if ($page.data("loading")) {
                    $page.addClass("loading");
                }
            }, 10);

            // Ajax Request the Traditional Page
            $.ajax({
                url: url,
                timeout: 5000,
                success: function(data, textStatus, jqXHR){
                    // Prepare
                    var
                        $data = $(documentHtml(data)),
                        $dataBody = $data.find('.document-body:first'),
                        $dataContent = $dataBody.find(".page").filter(':first'),
                        contentHtml,
                        $scripts;

                    // Fetch the scripts
                    $scripts = $dataContent.find('.document-script');
                    if ( $scripts.length ) {
                        $scripts.detach();
                    }

                    $data.find("a:internal").each( function() {
                        var $el = $(this);
                        $el.attr("href", makeAbsolute(url, $el.attr("href")));
                    });
                    $data.find("img:internal, iframe:internal").each( function() {
                        var $el = $(this);
                        $el.attr("src", makeAbsolute(url, $el.attr("src")));
                    });

                    // Fetch the content
                    contentHtml = $dataContent.html() || $data.html();
                    if ( !contentHtml ) {
                        document.location.href = url;
                        return false;
                    }

                    // Update the content
                    $page.html(contentHtml).ajaxify();

                    // Add the scripts
                    $scripts.each(function(){
                        var $script = $(this), scriptText = $script.text(), scriptNode = document.createElement('script');
                        scriptNode.appendChild(document.createTextNode(scriptText));
                        //contentNode.appendChild(scriptNode);
                    });

                    $dataBody
                        .removeClass('document-body');

                    $page
                        .removeClass('loading')
                        .data("loading", false)
                        .data("loaded", true)
                        .data("classes", $dataBody.attr("class"))
                        .data("title", $data.find('.document-title:first').text());

                    base.$el.trigger("depage.magaziner.loaded", [url, $page]);
                    base.$el.trigger("depage.magaziner.show", [url, $page]);
                    base.triggerShowLoaded(url, $page);
                },
                error: function(jqXHR, textStatus, errorThrown){
                    $page
                        .removeClass('loading')
                        .data("loading", false)
                        .data("loaded", false);

                    if (url === document.location.href) {
                        // only when page is current page
                        document.location.href = url;
                        return false;
                    }
                }
            }); // end ajax
        };
        // }}}
        // {{{ getNewPage
        base.getNewPage = function() {
            return $(pageHtml)
                .data("loaded", false)
                .data("loading", false)
                .appendTo(base.$el);
        };
        // }}}
        // {{{ setPagePos()
        base.setPagePos = function($page, newPos) {
            if (hasCssVariables) {
                $page[0].style.setProperty('--pageTranslateX', newPos + "px");
            } else {
                $page.css({
                    "transform": "translateX(" + newPos + "px)"
                });
            }
        };
        // }}}
        // {{{ show()
        base.show = function(n, animated, hash) {
            if (typeof animated == 'undefined') animated = true;
            if (typeof hash == 'undefined') hash = '';

            var isNewPage = base.currentPage !== n;
            var prevAnimated = animated;
            var nextAnimated = animated;
            var posDiff = n - base.currentPage;

            if (isNewPage) {
                if (posDiff > 1 || posDiff < -1) {
                    $prevPage.remove();
                    $currentPage.remove();
                    $nextPage.remove();

                    $prevPage = base.getNewPage();
                    $currentPage = base.getNewPage();
                    $nextPage = base.getNewPage();

                    prevAnimated = false;
                    nextAnimated = false;
                } else if (posDiff == 1) {
                    $prevPage.remove();
                    $prevPage = $currentPage;
                    $currentPage = $nextPage;
                    $nextPage = base.getNewPage();

                    nextAnimated = false;
                } else if (posDiff == -1) {
                    $nextPage.remove();
                    $nextPage = $currentPage;
                    $currentPage = $prevPage;
                    $prevPage = base.getNewPage();

                    prevAnimated = false;
                }
            }

            $prevPage.toggleClass("animated", prevAnimated);
            $currentPage.toggleClass("animated", animated);
            $nextPage.toggleClass("animated", nextAnimated);

            base.currentPage = n;

            if (hash != '') {
                var $target = $currentPage.find(hash);
                var scrollTo = 0;

                if ($target.length > 0) {
                    scrollTo = $target.offset().top - base.options.scrollOffset + $currentPage.scrollTop();
                }
                if (scrollTo == $currentPage.scrollTop()) {
                    $currentPage.scroll();
                } else if (animated) {
                    $currentPage.animate({scrollTop:scrollTo}, 300);
                } else {
                    $currentPage.scrollTop(scrollTo);
                }
            }

            if (isNewPage && document.location.href != urlsByPages[base.currentPage]) {
                History.pushState(null, null, urlsByPages[base.currentPage]);
            }

            base.preloadPageByNumber(n);

            // horizontal scrolling between pages
            base.setPagePos($prevPage, -1 * pageWidth);
            base.setPagePos($currentPage, 0);
            base.setPagePos($nextPage, 1 * pageWidth);

            if (isNewPage) {
                $(".current-page")
                    .removeClass("current-page")
                    .off("scroll");

                $currentPage.addClass("current-page");

                $currentPage.on("scroll", function() {
                    pageScrolling = true;
                    clearTimeout(pageScrollingTimeout);

                    pageScrollingTimeout = setTimeout(function() {
                        pageScrolling = false;
                    }, 250);
                });

                base.$el.trigger("depage.magaziner.show", [urlsByPages[n], $currentPage]);

                setTimeout(function() {
                    base.preloadPageByNumber(base.currentPage - 1);
                    base.preloadPageByNumber(base.currentPage + 1);

                    base.resetScroll();
                }, 500);
            }
        };
        // }}}
        // {{{ load
        base.load = function(url) {
            // loading page not in page list

            $prevPage.remove();
            $currentPage.remove();
            $nextPage.remove();

            $prevPage = base.getNewPage();
            $currentPage = base.getNewPage().addClass("current-page");
            $nextPage = base.getNewPage();

            History.pushState(null, null, url);

            base.setPagePos($prevPage, -1 * pageWidth);
            base.setPagePos($currentPage, 0);
            base.setPagePos($nextPage, 1 * pageWidth);

            setTimeout(function() {
                base.currentPage = -1;
                base.preloadPage($currentPage, url);
            }, 50);
        };
        // }}}
        // {{{ next()
        base.next = function() {
            if (base.currentPage < urlsByPages.length - 1) {
                // scroll to next page
                base.show(base.currentPage + 1);
                base.$el.trigger("depage.magaziner.next");

            } else {
                base.show(base.currentPage);
            }
        };
        // }}}
        // {{{ prev()
        base.prev = function() {
            if (base.currentPage > 0) {
                // scroll to previous page
                base.show(base.currentPage - 1);
                base.$el.trigger("depage.magaziner.prev");
            } else {
                base.show(base.currentPage);
            }
        };
        // }}}

        // Run initializer
        setTimeout(base.init, 50);
    };

    $.depage.magaziner.defaultOptions = {
        scrollOffset: 0
    };

    $.fn.depageMagaziner = function(pagelinkSelector, options){
        return this.each(function(){
            (new $.depage.magaziner(this, pagelinkSelector, options));
        });
    };

})(jQuery);
/* vim:set ft=javascript sw=4 sts=4 fdm=marker : */
