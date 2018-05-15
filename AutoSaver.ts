let _saverHandler: () => void | undefined;
let saverTimer: NodeJS.Timer;

const save = () => {
    if (_saverHandler !== undefined) {
        clearTimeout(saverTimer);
        // let object sync back
        saverTimer = setTimeout(() => {
            try {
                _saverHandler();
            } catch (e) {
                console.error(e);
            }
        },                      100);
    }
};

const autoSaver = {
    get(target: any, propName: PropertyKey) {
        const val = target[propName];
        // console.info("get", target, propName, val);
        return val;
    },
    set(target: any, propName: PropertyKey, value: any) {
        target[propName] = value;
        // console.info("set", target, propName, value);
        save();
        return true;
    },
};

export {
    _saverHandler,
    saverTimer,
    save,
    autoSaver,
};
