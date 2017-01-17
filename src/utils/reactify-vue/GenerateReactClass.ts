import * as React from 'react';
import {camelCase} from 'change-case';

import {createReactElement} from './react-element-creation/CreateReactElements';
import {IVueComponent} from './ReactifyVue';

const copyMethodsToVueComponent = (vueComponent: IVueComponent) => {
    if (vueComponent.methods) {
        Object.keys(vueComponent.methods)
            .forEach(methodName => vueComponent[methodName] = vueComponent.methods[methodName]);

        delete vueComponent.methods;
    }
};

const copyPropsToVueComponent = (vueComponent: IVueComponent, props: any) => {
    if (props) {
        Object.keys(props)
            .forEach(propName => {
                if (!vueComponent[propName]) {
                    vueComponent[propName] = props[propName];
                }
            });
    }
};

const getComponentTag = (component: any) => {
     if (component.type && component.type.tag) {
         return component.type.tag;
     } else if (component.type && typeof component.type === 'string') {
         return component.type;
     } else {
         return undefined;
     }
};

const copySlotsToVueComponent = (vueComponent: IVueComponent, slotMapping, props) => {
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

const copyArgsToVueComponent = (vueComponent: IVueComponent, args: any) => {
    if (args) {
        Object.keys(args)
            .forEach(argName => vueComponent[argName] = args[argName]);
    }
}

const callPropOnEvent = (eventName: string, eventArgs: any[], props: any) => {
    const eventNameCamelCase = camelCase('on-' + eventName.split(':').join('-'));

    if (props[eventNameCamelCase]) {
        props[eventNameCamelCase](eventArgs);
    }
};

const handleWatchedProperties = (vueComponent: IVueComponent, currentProps: any, nextProps: any) => {
    if (vueComponent.watch) {
        Object.keys(vueComponent.watch)
            .forEach(watchedProperty => {
                if (currentProps[watchedProperty] !== nextProps[watchedProperty]) {
                    vueComponent.watch[watchedProperty]();
                }
            });
    }
};

const handleComputedProperties = (vueComponent: IVueComponent) => {
    if (vueComponent.computed) {
        Object.keys(vueComponent.computed)
            .forEach(propertyName => {
                vueComponent[propertyName] = vueComponent.computed[propertyName].apply(vueComponent, [])
            });
    }
}

const applyMixinToVueComponent = (vueComponent: IVueComponent, mixin: any) => {
    if (mixin) {
        Object.keys(mixin).forEach(mixinProp => {
            vueComponent[mixinProp] = mixin[mixinProp];
        });
    }
};

const getDefaultProps = (vueComponent: IVueComponent) => {
    if (vueComponent.props) {
        const defaultProps = Object.keys(vueComponent.props).reduce((defaultProps, propName) => {
            const propDef = vueComponent.props[propName];

            if (propDef.default) {
                return {
                    ...defaultProps,
                    [propName]: propDef.default
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

const addCompiledTemplateFunctionsToVueComponent = (vueComponent: any, createElement: Function) => {
    vueComponent._self = { _c: createElement.bind(vueComponent) };
    vueComponent._t = (slotName: string, fallback) => {
        const slotValue = vueComponent.$slots[slotName];

        if (fallback && (!slotValue || !slotValue.length)) {
            return fallback;
        } else {
            return slotValue;
        }
    };

    vueComponent._v = (text: string) => text;
    vueComponent._s = (text: string) => text;
    vueComponent._e = () => null;
};

const generateCreateElementFunctionForClass = (classVueComponentInstance, instantiatedComponents, vueComponent) => {
    return (element, args, children) => {
        if (typeof args !== 'object' || Array.isArray(args)) {
            //Children passed in as second argument
            return createReactElement(element, {}, args, instantiatedComponents, vueComponent);
        } else {
            return createReactElement(element, args, children, instantiatedComponents, vueComponent);
        }
    };
};

const removePropsFromElementAndChildren = (element, propsToRemove) => {
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

const applyAdditionalClassesAndStyles = (element) => {
    if (element.props.additionalClassName) {
        const existingClassName = element.props.className || '';
        element.props.className = existingClassName + ' ' + element.props.additionalClassName;        
    }

    if (element.props.additionalStyles) {
        const existingStyles = element.props.style || {};
        
        element.props.style = {
            ...existingStyles,
            ...element.props.additionalStyles
        };        
    }

    if (element.props.additionalClassName || element.props.additionalStyles) {
        return removePropsFromElementAndChildren(element, ['additionalClassName', 'additionalStyles']);
    } else {
        return element;
    }    
};

const generateVueComponentWithInstanceProperties = (vueComponent, props, self) => {
    self.nextTickCallbacks = [];

    const instanceVueComponent = {...vueComponent, ...{
        $emit: (eventName: string, ...eventArgs: any[]) => {
            callPropOnEvent(eventName, eventArgs, props);
        },
        $parent: props.parentVueComponent,
        $options: {
            propsData: props
        },
        $nextTick: (func) => self.nextTickCallbacks.push(func)       
    }};

    handleComputedProperties(instanceVueComponent);

    return instanceVueComponent;
}

export const generateReactClass = <TProps>(instantiatedComponents, vueComponent, slots, tag, mixin, args) => {
    applyMixinToVueComponent(vueComponent, mixin);
    copyMethodsToVueComponent(vueComponent);
    copyArgsToVueComponent(vueComponent, args);

    const reactClass = React.createClass<TProps, any>({
        getInitialState: function() {
            this.vueComponent = generateVueComponentWithInstanceProperties(vueComponent, this.props, this);
            this.createElement = generateCreateElementFunctionForClass(this.vueComponent, instantiatedComponents, this.vueComponent);

            copyPropsToVueComponent(this.vueComponent, this.props);
            copySlotsToVueComponent(this.vueComponent, slots, this.props);

            addCompiledTemplateFunctionsToVueComponent(this.vueComponent, this.createElement);

            Object.defineProperty(vueComponent, '$el', {
                get: () => this.element,
                enumerable: true,
                configurable: true
            });            

            return null;
        },

        componentWillUpdate: function() {
            if (this.vueComponent.updated) this.vueComponent.updated();
        },

        componentDidUpdate: function() {
            this.nextTickCallbacks.forEach(callback => callback.apply(this.vueComponent, []));
        },

        componentDidMount: function() {
            if (this.vueComponent.mounted) this.vueComponent.mounted();
        },

        componentWillUnmount: function() {
            if (vueComponent.beforeDestroy) vueComponent.beforeDestroy();
        },

        componentWillReceiveProps: function(nextProps) {
            handleWatchedProperties(this.vueComponent, this.props, nextProps);
        },

        render: function() {
            copyPropsToVueComponent(this.vueComponent, this.props);
            copySlotsToVueComponent(this.vueComponent, slots, this.props);
            handleComputedProperties(this.vueComponent);

            const reactElement = this.vueComponent.render(this.createElement.bind(this));
            const reactElementWithTag = {...reactElement, props: { ...reactElement.props}, tag: tag};
            const reactElementWithAdditionalClasesAndStyles = applyAdditionalClassesAndStyles(reactElementWithTag);
            Object.preventExtensions(reactElementWithAdditionalClasesAndStyles);

            return reactElementWithAdditionalClasesAndStyles;
        },

        callVueMethod: function(methodName: string, ...args: any[]) {
            return this.vueComponent[methodName](args);
        }
    });

    (reactClass as any).tag = tag;
    (reactClass as any).vueComponent = vueComponent;

    const defaultProps = getDefaultProps(vueComponent);

    if (defaultProps) (reactClass as any).defaultProps = defaultProps;

    return reactClass;
};