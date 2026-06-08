(function(root) {
    "use strict";

    function isThreeDimensionalSource(text) {
        return /^\s*three_dimensions\b/im.test(text || "");
    }

    function routeTo3DEditor() {
        const url = new URL(root.location.href);
        url.pathname = url.pathname.replace(/editor\.html$/, "editor3d.html");
        root.location.replace(url.toString());
    }

    function optionIs3DDemo(option) {
        return option
            && option.parentNode
            && option.parentNode.tagName === "OPTGROUP"
            && option.parentNode.label === "Puzzlescript Next 3D";
    }

    if (root.document && typeof root.document.addEventListener === "function") {
        root.document.addEventListener("change", function(event) {
            const target = event && event.target;
            if (!target || target.id !== "exampleDropdown")
                return;
            const option = target.options[target.selectedIndex];
            if (!optionIs3DDemo(option))
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const url = new URL(root.location.href);
            url.pathname = url.pathname.replace(/editor\.html$/, "editor3d.html");
            url.searchParams.delete("url");
            url.searchParams.delete("hack");
            url.searchParams.set("demo", target.value);
            root.location.href = url.toString();
        }, true);
    }

    if (typeof root.loadGame === "function") {
        const loadGame2D = root.loadGame;
        root.loadGame = function(text, docompile, doclear) {
            if (isThreeDimensionalSource(text)) {
                routeTo3DEditor();
                return;
            }
            return loadGame2D.apply(this, arguments);
        };
    }
})(typeof window !== "undefined" ? window : globalThis);
