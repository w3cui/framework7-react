import * as React from 'react';
import {camelCase} from 'change-case';

import {IVueComponent} from '../ReactifyVue';
import {createReactElement} from '../react-element-creation/CreateReactElements';

export const copyMethodsToVueComponent = (vueComponent: IVueComponent) => {
    if (vueComponent.methods) {
        Object.keys(vueComponent.methods)
            .forEach(methodName => vueComponent[methodName] = vueComponent.methods[methodName]);

        delete vueComponent.methods;
    }
};

export const copyPropsToVueComponent = (vueComponent: IVueComponent, props: any) => {
    if (props) {
        Object.keys(props)
            .forEach(propName => {
                if (typeof vueComponent[propName] !== 'function' || typeof vueComponent[propName] === 'function' && !vueComponent[propName]) {
                    vueComponent[propName] = props[propName];
                }
            });
    }
};

export const getComponentTag = (component: any) => {
     if (component.type && component.type.tag) {
         return component.type.tag;
     } else if (component.type && typeof component.type === 'string') {
         return component.type;
     } else {
         return undefined;
     }
};

export const copySlotsToVueComponent = (vueComponent: IVueComponent, slotMapping, props) => {
    const reactChildrenArray = props && props.children && React.Children.toArray(props.children) as (React.ReactElement<any>)[];

    const slots = {
        default: (reactChildrenArray && reactChildrenArray.length) ?  reactChildrenArray : null
    };

    if (slotMapping && props) {
        Object.keys(slotMapping)
            .forEach(slotName => {
                slots[slotName] = props[slotMapping[slotName]] || [];
            });
    }

    Object.keys(slots)
        .forEach(slotName => {
            const slot = slots[slotName];

            if (Array.isArray(slot)) {
                slot.forEach((slotChild, index) => {
                    if (typeof slotChild !== 'string') {
                        slots[slotName][index] = {...slotChild, tag: getComponentTag(slotChild)};
                    }
                });
            }
        });

    vueComponent.$slots = slots;
}

export const copyArgsToVueComponent = (vueComponent: IVueComponent, args: any) => {
    if (args) {
        Object.keys(args)
            .forEach(argName => vueComponent[argName] = args[argName]);
    }
}

export const handleWatchedProperties = (vueComponent: IVueComponent, currentProps: any, nextProps: any) => {
    if (vueComponent.watch) {
        copyPropsToVueComponent(vueComponent,nextProps);
        handleComputedProperties(vueComponent);

        Object.keys(vueComponent.watch)
            .forEach(watchedProperty => {
                if (currentProps[watchedProperty] !== nextProps[watchedProperty]) {
                    vueComponent.watch[watchedProperty].apply(vueComponent, [nextProps[watchedProperty]]);
                }
            });
    }
};

export const handleComputedProperties = (vueComponent: IVueComponent) => {
    if (vueComponent.computed) {
        Object.keys(vueComponent.computed)
            .forEach(propertyName => {
                vueComponent[propertyName] = vueComponent.computed[propertyName].apply(vueComponent, [])
            });
    }
}

export const applyMixinToVueComponent = (vueComponent: IVueComponent, mixin: any) => {
    if (mixin) {
        Object.keys(mixin).forEach(mixinProp => {
            vueComponent[mixinProp] = mixin[mixinProp];
        });
    }
};

export const getDefaultProps = (vueComponent: IVueComponent) => {
    if (vueComponent.props) {
        const defaultProps = Object.keys(vueComponent.props).reduce((defaultProps, propName) => {
            const propDef = vueComponent.props[propName];
            
            if (propDef.default) {
                return {
                    ...defaultProps,
                    [camelCase(propName)]: propDef.default
                };
            } else {
                return defaultProps;
            }
        }, {});

        return Object.keys(defaultProps).length ? defaultProps : null;
    } else {
        return null;
    }
};

export const addCompiledTemplateFunctionsToVueComponent = (vueComponent: any, createElement: Function) => {
    vueComponent._self = { _c: createElement.bind(vueComponent) };
    vueComponent._t = (slotName: string, fallback) => {
        const slotValue = vueComponent.$slots[slotName];

        if (fallback && (!slotValue || !slotValue.length)) {
            return fallback;
        } else {
            return slotValue;
        }
    };

    vueComponent._v = (text: string) => text || '';
    vueComponent._s = (text: string) => text || '';
    vueComponent._e = () => null;
};

export const generateCreateElementFunctionForClass = (classVueComponentInstance, instantiatedComponents, vueComponent) => {
    return (element, args, children) => {
        if (typeof args !== 'object' || Array.isArray(args)) {
            //Children passed in as second argument
            return createReactElement(element, {}, args, instantiatedComponents, vueComponent);
        } else {
            return createReactElement(element, args, children, instantiatedComponents, vueComponent);
        }
    };
};

export const removePropsFromElementAndChildren = (element, propsToRemove) => {
    let children = element && element.props && element.props.children;

    if (children) {
        if (Array.isArray(children)) {
            children = children.map(child => removePropsFromElementAndChildren(child, propsToRemove));
        } else {
            children = removePropsFromElementAndChildren(children, propsToRemove);
        }
    }

    if (element && element.props && Object.keys(element.props).filter(propName => propsToRemove.indexOf(propName) !== -1).length) {
        return {...element, props: Object.keys(element.props).reduce((newProps, nextPropName) => {
            if (nextPropName === 'children') {
                return {
                    ...newProps,
                    children: children
                };
            } else if (propsToRemove.indexOf(nextPropName) === -1) {
                return {
                    ...newProps,
                    [nextPropName]: element.props[nextPropName]
                };
            } else {
                return newProps;
            }
        }, {})};
    } else {
        return element;
    }
};

export const applyPropOverrides = (reactElement: React.ReactElement<any>, tag: string, self) => {
    const refFunc = (e: HTMLElement) => {
        reactElement.props.refTemp(e);
        self.element = e;

        self.nextTickCallbacks.forEach(callback => callback.apply(this.vueComponent, []));
        self.nextTickCallbacks = [];
        self.hasUnrenderedStateChanges = false;        
    };

    const elementWithPropOverrides = {...reactElement, props: { ...reactElement.props}, tag: tag, ref: refFunc };

    if (elementWithPropOverrides.props.additionalClassName) {
        const existingClassName = elementWithPropOverrides.props.className || '';
        elementWithPropOverrides.props.className = [existingClassName, ' ', elementWithPropOverrides.props.additionalClassName].join('');
    }

    if (elementWithPropOverrides.props.additionalStyles) {
        const existingStyles = elementWithPropOverrides.props.style || {};
        
        elementWithPropOverrides.props.style = {
            ...existingStyles,
            ...elementWithPropOverrides.props.additionalStyles
        };        
    }

    if (self.vueComponent.id) {
        elementWithPropOverrides.props.id = self.vueComponent.id;
    }

    const newProps = elementWithPropOverrides;

    //removePropsFromElementAndChildren(
    //    elementWithPropOverrides, 
    //    ['additionalClassName', 'additionalStyles', 'refTemp']
    //);

    return newProps;
};

export const initData = (vueComponent) => {
    let state = null;

    if (vueComponent.data) {
        state = vueComponent.data();

        Object.keys(state).forEach(stateKey => {
            vueComponent[stateKey] = state[stateKey];
        });
    }

    return state;
};