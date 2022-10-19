/**
 * @require framework/shared/jquery-1.4.2.js
 * @require framework/shared/jquery.hammer.js
 *
 * @file    depage-magaziner.js
 *
 * adds a magazine like navigation to a website
 *
 *
 * copyright (c) 2013-2020 Frank Hellenkamp [jonas@depage.net]
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
    var pageScrollingTimeout;
    var pageHtml = "<div class=\"page\"></div>";
    var resizeTimer = null;
    var preloadPageTimer = null;

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
        if (relative && relative.match(/^https?:\/\//)) {
            return relative;
        } else if (baseUrl) {
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
    // {{{ isSmoothScrollSupported
    var isSmoothScrollSupported = 'scrollBehavior' in document.documentElement.style;
    // }}}
    // {{{ setElementProperty
    var setElementProperty = (function() {
        if (window.CSS && CSS.supports('color', 'var(--fake-var)')) {
            return function($el, propertyName, cssProperty, propertyValue, cssValue) {
                $el[0].style.setProperty(propertyName, propertyValue);
            }
        }

        return function($el, propertyName, cssProperty, propertyValue, cssValue) {
            if (typeof cssValue == 'undefined') {
                cssValue = propertyValue;
            }
            $el.eq(0).css(cssProperty, cssValue);
        }
    })();
    // }}}
    // {{{ transitionEndEvent
    var transitionEndEvent = function () {
        var t,
            el = document.createElement("fakeelement");

        var transitions = {
            "transition"      : "transitionend",
            "OTransition"     : "oTransitionEnd",
            "MozTransition"   : "transitionend",
            "WebkitTransition": "webkitTransitionEnd"
        }

        for (t in transitions){
            if (el.style[t] !== undefined){
            return transitions[t];
            }
        }
    }();
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
        var $html = $("html");
        var $body = $("body");
        var $head = $("head");
        var $window = $(window);
        var $document = $(document);

        var capabilities = "";
        if (hasTouch) {
            capabilities += " has-touch";
        } else {
            capabilities += " no-touch";
        }
        $("html").addClass(capabilities);

        // width of one page
        var pageWidth = base.$el.width();

        // global hammer options to drag only in one direction
        delete Hammer.defaults.cssProps.userSelect;
        var hammerOptions = {
            threshold: 30,
            touchAction: "pan-y",
            direction: Hammer.DIRECTION_HORIZONTAL
        };
        if (pageWidth > 1000) {
            hammerOptions.threshold *= 2;
        }
        var scrollY = 0;

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
            $this.find('a[href]:internal:not(.no-ajaxy)').each(function(){
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

                    $(this).blur();

                    if (typeof pagesByUrl[urlPath] !== 'undefined') {
                        base.show(pagesByUrl[urlPath], true, hash);
                    } else {
                        base.load(url);
                    }
                    return e.preventDefault();
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

            $currentPage
                .data("loaded", true)
                .data("loading", false)
                .data("classes", $body.attr("class"))
                .data("title", document.title)
                .data("meta", $head.find("meta[name], meta[property]"))
                .data("ldjson", $head.find("script[type='application/ld+json']"))
                .data("link", $head.find("link[rel='canonical'], link[rel='alternate'], link[rel='icon']"));

            $prevPage = base.getNewPage();
            $nextPage = base.getNewPage();

            base.$el.trigger("depage.magaziner.initialized");

            base.show(base.currentPage);

            base.schedulePagePreload();
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
            base.$el.hammer(hammerOptions).on("panleft panright swipeleft swiperight", function(e) {
                if (e.gesture.pointerType == "mouse" || e.gesture.srcEvent.type == 'pointercancel') {
                    return;
                }
                if (urlsByPages.length == 1) {
                    return;
                }

                base.$el.removeClass("animated");

                scrollY = $window.scrollTop();

                base.offsetPages(e.gesture.deltaX);
            });
            // }}}
            // {{{ dragend actions after horizontal or vertical scrolling
            base.$el.hammer(hammerOptions).on("panend pancancel", function(e) {
                if (e.gesture.pointerType == "mouse") {
                    return;
                }
                if (urlsByPages.length == 1) {
                    return;
                }
                if (Math.abs(e.gesture.deltaY) > hammerOptions.threshold) {
                    base.show(base.currentPage);

                    return;
                }
                var minVelocity = 0.1;
                var minMovement = pageWidth / 6;

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
                }
            });
            // }}}

            // {{{ resize event
            var onResize =  function() {
                pageWidth = base.$el.width();
                base.show(base.currentPage, false);
            };

            $window.on("resize, orientationchange", function() {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout( onResize, 200 );
            });
            // }}}

            // {{{ popstate event
            $window.on("popstate", function() {
                var
                    url = window.location.href + '',
                    relativeUrl = url.replace(rootUrl,'');

                url = url.split("#")[0];

                if (typeof pagesByUrl[url] !== 'undefined') {
                    base.show(pagesByUrl[url], true);
                } else {
                    base.load(url);
                }
            });
            // }}}
            // {{{ statechangecomplete event
            base.$el.on("depage.magaziner.statechangecomplete", function(e, url, $page) {
                var
                    title = $currentPage.data("title"),
                    $meta = $currentPage.data("meta"),
                    $ldjson = $currentPage.data("ldjson"),
                    $link = $currentPage.data("link");

                if (title) {
                    // Update the title
                    document.title = title;
                    try {
                        document.getElementsByTagName('title')[0].innerHTML = document.title.replace('<','&lt;').replace('>','&gt;').replace(' & ',' &amp; ');
                    }
                    catch ( Exception ) { }
                }
                if ($meta) {
                    $head.find("meta[name], meta[property]").remove();
                    $meta.each(function() {
                        var $m = $("<meta />");
                        $.each(this.attributes, function(i, attrib){
                            if (attrib.name == 'class') return;
                            $m.attr(attrib.name, attrib.value);
                        });
                        $head.append($m);
                    });
                }
                if ($ldjson) {
                    $head.find("script[type='application/ld+json']").remove();
                    $ldjson.each(function() {
                        var $l = $("<script type=\"application/ld+json\" />");
                        $l.text($ldjson.text());
                        $head.append($l);
                    });
                }
                if ($link) {
                    $head.find("link[rel='canonical'], link[rel='alternate'], link[rel='icon']").remove();
                    $link.each(function() {
                        var $l = $("<link />");
                        $.each(this.attributes, function(i, attrib){
                            if (attrib.name == 'class') return;
                            $l.attr(attrib.name, attrib.value);
                        });
                        $head.append($l);
                    });
                }

                $body.attr("class", $currentPage.data("classes"));

                base.initPageLinks();

                // Inform matomo of the change
                if ( typeof window._paq !== 'undefined' ) {
                    window._paq.push(['deleteCustomDimension', 1]);
                    window._paq.push(['setCustomUrl', url]);
                    window._paq.push(['setDocumentTitle', title]);
                    window._paq.push(['trackPageView']);
                }

                // Inform Google Analytics of the change
                if ( typeof window._gaq !== 'undefined' ) {
                    window._gaq.push(['_trackPageview', url]);
                } else if ( typeof window.ga !== 'undefined' ) {
                    window.ga('send', 'pageview');
                }

                // Inform pinterest of the change
                if ( typeof window.pintrk !== 'undefined' ) {
                    window.pintrk('track', 'pagevisit');
                }

                // inform google tag manager
                if ( typeof window.dataLayer !== 'undefined' ) {
                    window.dataLayer.push({
                        'event': 'Pageview',
                        'pagePath': url,
                        'pageTitle': title,
                        'visitorType': 'visitor'
                    });
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
        // {{{ schedulePagePreload()
        base.schedulePagePreload = function(n) {
            if (base.options.preloadPageTimeout < 0) return;

            preloadPageTimer = setTimeout(function() {
                base.preloadPageByNumber(base.currentPage + 1);

                preloadPageTimer = setTimeout(function() {
                    base.preloadPageByNumber(base.currentPage - 1);
                }, base.options.preloadPageTimeout);
            }, base.options.preloadPageTimeout);
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
                success: function(data) {
                    // Prepare
                    var
                        $data = $(documentHtml(data)),
                        $dataBody = $data.find('.document-body:first'),
                        $dataContent = $dataBody.find(".page").filter(':first'),
                        contentHtml,
                        $scripts;

                    $data.find("a[href]:internal").each( function() {
                        var $el = $(this);
                        $el.attr("href", makeAbsolute(url, $el.attr("href")));
                    });
                    $data.find("img:internal, iframe:internal").each( function() {
                        var $el = $(this);
                        $el.attr("src", makeAbsolute(url, $el.attr("src")));
                    });

                    // Fetch the content
                    contentHtml = $dataContent.html();
                    if ( !contentHtml ) {
                        document.location.href = url;
                        return false;
                    }

                    // Update the content
                    $page.html(contentHtml).ajaxify();

                    $dataBody
                        .removeClass('document-body');

                    $page
                        .removeClass('loading')
                        .data("loading", false)
                        .data("loaded", true)
                        .data("classes", $dataBody.attr("class"))
                        .data("title", $data.find('.document-title:first').text())
                        .data("meta", $data.find(".document-meta[name], .document-meta[property]"))
                        .data("ldjson", $data.find(".document-script[type='application/ld+json']"))
                        .data("link", $data.find("link[rel='canonical'], link[rel='alternate'], link[rel='icon']"));

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
                .data("attached", false);
        };
        // }}}
        // {{{ attachPage
        base.attachPage = function($page) {
            if ($page.data("attached") === true) return;

            $page.data("attached", true).appendTo(base.$el);
            base.$el.trigger("depage.magaziner.attached", [$page]);
        };
        // }}}
        // {{{ detachPage
        base.detachPage = function($page) {
            if ($page.data("attached") === false) return;

            $page.data("attached", false).detach();
            base.$el.trigger("depage.magaziner.detached", [$page]);
        };
        // }}}
        // {{{ removePage
        base.removePage = function($page) {
            base.$el.trigger("depage.magaziner.removed", [$page]);

            $page.remove();
        };
        // }}}
        // {{{ offsetPages
        base.offsetPages = function(x, adjustYOffset) {
            base.attachPage($currentPage);
            if (x > -1 * pageWidth && x != 0) base.attachPage($prevPage);
            if (x < 1 * pageWidth && x != 0) base.attachPage($nextPage);

            base.setPageOffset($prevPage, -1 * pageWidth + x, scrollY, adjustYOffset);
            base.setPageOffset($currentPage, x, 0);
            base.setPageOffset($nextPage, 1 * pageWidth + x, scrollY, adjustYOffset);
        };
        // }}}
        // {{{ setPageOffset()
        base.setPageOffset = function($page, x, y, adjustYOffset) {
            if ($page.length == 0) return;

            if (typeof adjustYOffset == 'undefined') {
                adjustYOffset = true;
            }
            base.setPageXOffset($page, x);
            if (adjustYOffset) base.setPageYOffset($page, y);
        };
        // }}}
        // {{{ setPageXOffset()
        base.setPageXOffset = function($page, x) {
            setElementProperty($page, '--pageTranslateX', 'transform', x + 'px', "translateX(" + x + "px)");
        };
        // }}}
        // {{{ setPageYOffset()
        base.setPageYOffset = function($page, y) {
            if ($page.length == 0) return;

            setElementProperty($page, '--pageTranslateY', 'transform', y + 'px', "translateY(" + y + "px)");
        };
        // }}}
        // {{{ show()
        base.show = function(n, animated, hash) {
            if (typeof animated == 'undefined') animated = true;
            if (typeof hash == 'undefined') hash = '';

            var isNewPage = base.currentPage !== n;
            var posDiff = n - base.currentPage;

            if (isNewPage) {
                if (posDiff > 1 || posDiff < -1) {
                    base.removePage($prevPage);
                    base.removePage($currentPage);
                    base.removePage($nextPage);

                    $prevPage = base.getNewPage();
                    $currentPage = base.getNewPage();
                    $nextPage = base.getNewPage();
                } else if (posDiff == 1) {
                    base.removePage($prevPage);
                    $prevPage = $currentPage;
                    $currentPage = $nextPage;
                    $nextPage = base.getNewPage();
                    base.attachPage($currentPage);
                } else if (posDiff == -1) {
                    base.removePage($nextPage);
                    $nextPage = $currentPage;
                    $currentPage = $prevPage;
                    $prevPage = base.getNewPage();
                    base.attachPage($currentPage);
                }
            }

            base.$el.toggleClass("animated", animated);

            base.currentPage = n;

            if (isNewPage && document.location.href != urlsByPages[base.currentPage]) {
                History.pushState(null, null, urlsByPages[base.currentPage]);
            }

            clearTimeout(preloadPageTimer);

            base.preloadPageByNumber(n);
            base.attachPage($currentPage);

            if (isNewPage) {
                scrollY = $window.scrollTop();

                var $oldCurrentPage = $(".current-page");
                var y = -1 * scrollY;

                $oldCurrentPage.removeClass("current-page");
                $currentPage.addClass("current-page");

                // reset scroll
                window.scrollTo(0,0);
                scrollY = 0;

                base.setPageYOffset($oldCurrentPage, y);

                base.$el.trigger("depage.magaziner.hide", [$oldCurrentPage]);
                base.$el.trigger("depage.magaziner.show", [urlsByPages[n], $currentPage]);

                $currentPage.one(transitionEndEvent, function() {
                    base.schedulePagePreload();
                });
            }
            $currentPage.one(transitionEndEvent, function() {
                base.detachPage($prevPage);
                base.detachPage($nextPage);

                base.$el.removeClass("animated");
            });

            // horizontal scrolling between pages
            base.offsetPages(0, false);

            if (hash != '') {
                // smooth scroll to current target on page
                var $target = $currentPage.find(hash);
                var options = {
                    "behavior": "smooth",
                    "left": 0,
                    "top": 0
                };

                if ($target.length > 0) {
                    scrollY = $target.offset().top - base.options.scrollOffset;
                    options.top = scrollY;
                }
                if (scrollY == $window.scrollTop()) {
                    $html.scroll();
                } else if (animated && isSmoothScrollSupported) {
                    window.scrollTo(options);
                } else {
                    window.scrollTo(options.left, options.top);
                }
            }
        };
        // }}}
        // {{{ load
        base.load = function(url) {
            // loading page not in page list
            base.removePage($prevPage);
            base.removePage($currentPage);
            base.removePage($nextPage);

            $prevPage = base.getNewPage();
            $currentPage = base.getNewPage().addClass("current-page");
            $nextPage = base.getNewPage();

            History.pushState(null, null, url);

            base.offsetPages(0);

            clearTimeout(preloadPageTimer);

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
        scrollOffset: 0,
        preloadPageTimeout: 1000
    };

    $.fn.depageMagaziner = function(pagelinkSelector, options){
        return this.each(function(){
            (new $.depage.magaziner(this, pagelinkSelector, options));
        });
    };

})(jQuery);
/* vim:set ft=javascript sw=4 sts=4 fdm=marker : */
