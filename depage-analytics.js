/**
 * @require framework/shared/jquery-1.4.2.js
 *
 * @file    depage-analytics.js
 *
 * abstracts asking for cookie consent and initialializing analytics if allowed
 *
 *
 * copyright (c) 2019 Frank Hellenkamp [jonas@depage.net]
 *
 * @author    Frank Hellenkamp [jonas@depage.net]
 **/
;(function($, w){
    if(!$.depage){
        $.depage = {};
    }

    var config = w.depageAnalyticsConfig || {};
    var cookieName = config.cookieName || "privacy-policy-accepted";
    var lang = $('html').attr('lang') || "en";

    var loadScript = function(url) {
        var script = document.createElement('script'),
            el = document.getElementsByTagName('script')[0];

        script.type = 'text/javascript';
        script.async = true;
        script.defer = true;
        script.src = url;

        el.parentNode.insertBefore(script, el);
    }

    $.depage.analytics = function(el, options){
        // To avoid scope issues, use 'base' instead of 'this' to reference this class from internal events and functions.
        var base = this;
        var $html = $("<div class=\"privacy-badger\"></div>");

        // Access to jQuery and DOM versions of element
        base.$el = $(el);
        base.el = el;

        // Add a reverse reference to the DOM object
        base.$el.data("depage.analytics", base);

        // {{{ init()
        base.init = function() {
            base.options = $.extend({},$.depage.analytics.defaultOptions, options);

            if (Cookies.get(cookieName) === "false") {
                return;
            }
            if (Cookies.get(cookieName) === "true") {
                base.startTracking();

                return;
            }

            base.show();
        };
        // }}}
        // {{{ displayPrivacyBadger()
        base.show = function() {
            var $message = $("<p></p>");
            var $buttonWrapper = $("<div class=\"button-wrapper\"></div>");
            var $accept = $("<button></button>");
            var $cancel = $("<button></button>");

            $message
                .html(base.options.messageHtml.replace("{$privacyPolicyLink}", base.options.privacyPolicyLink))
                .appendTo($html);
            $buttonWrapper
                .appendTo($html);
            $accept
                .text(base.options.acceptText)
                .attr("class", "accept")
                .appendTo($buttonWrapper)
                .on("click", function() {
                    base.hide();

                    base.startTracking();
                });
            $cancel
                .text(base.options.rejectText)
                .attr("class", "reject")
                .appendTo($buttonWrapper)
                .on("click", function() {
                    base.hide();

                    Cookies.set(cookieName, "false", { expires: base.options.expires });
                });

            $html.hide().appendTo(base.$el).fadeIn();
        };
        // }}}
        // {{{
        base.hide = function( ){
            $html.fadeOut({
                complete: function() {
                    $html.remove();
                }
            });
        }
        // }}}

        // {{{ startTracking()
        base.startTracking = function() {
            Cookies.set(cookieName, "true", { expires: base.options.expires });

            if (!base.options.depageIsLive) {
                return;
            }
            if (base.options.matomo) {
                base.startMatomo();
            }
            if (base.options.ga) {
                base.startGoogleAnalytics();
            }
        }
        // }}}
        // {{{ startMatomo()
        base.startMatomo = function() {
            w._paq = w._paq || [];

            if (base.options.matomo.domain) {
                w._gaq.push(['_setDomainName', base.options.matomo.domain]);
            }
            w._paq.push(['trackPageView']);
            w._paq.push(['enableLinkTracking']);
            w._paq.push(['enableHeartBeatTimer']);
            w._paq.push(['setTrackerUrl', base.options.matomo.url + 'matomo.php']);
            w._paq.push(['setSiteId', base.options.matomo.siteId]);

            loadScript(base.options.matomo.url + 'matomo.js');
        }
        // }}}
        // {{{ startGoogleAnalytics()
        base.startGoogleAnalytics = function() {
            loadScript('https://www.googletagmanager.com/gtag/js?id=' + base.options.ga.account);

            w.dataLayer = w.dataLayer || [];
            w.gtag = function(){
                w.dataLayer.push(arguments);
            }

            w.gtag('js', new Date());
            w.gtag('set', {
                'anonymize_ip': true,
                'allow_ad_personalization_signals': false
            });
            w.gtag('config', base.options.ga.account);
        }
        // }}}

        // Run initializer
        base.init();
    };

    $.depage.analytics.defaultOptions = {
        messageHtml: "We use cookies and similar technologies to understand how you use our services and improve your experience. By clicking 'Accept', you accept all cookies. Otherwise we use only functionally essential cookies. For more information, please see our <a href=\"{$privacyPolicyLink}\">Data Protection Policy</a>",
        depageIsLive: typeof config.depageIsLive != 'undefined' ? config.depageIsLive : true,
        matomo: config.matomo || false,
        ga: config.ga || false,
        privacyPolicyLink: config.privacyPolicyLink || "",
        acceptText: "Accept cookies",
        rejectText: "Reject",
        expires: 3 * 30 * 24 * 60 * 60 // 3 months
    };

    if (lang == "de") {
        $.depage.analytics.defaultOptions.messageHtml = "Um unseren Webauftritt für Sie optimal zu gestalten und fortlaufend verbessern zu können, verwenden wir Cookies. Wenn Sie 'Akzeptieren' klicken, stimmen Sie der Verwendung aller Cookies zu. Andernfalls verwenden wir nur funktional unverzichtbare Cookies. Weitere Informationen, erhalten Sie in unserer <a href=\"{$privacyPolicyLink}\">Datenschutzerklärung</a>.";
        $.depage.analytics.defaultOptions.acceptText = "Cookies akzeptieren";
        $.depage.analytics.defaultOptions.rejectText = "Ablehnen";
    }

    $.fn.depageAnalytics = function(options){
        return this.each(function(){
            (new $.depage.analytics(this, options));
        });
    };
})(jQuery, window);

// vim:set ft=javascript sw=4 sts=4 fdm=marker :
