import { Denomination } from "../consts/Enums";

const iconDenominators = new Set<string>([Denomination.Btc, Denomination.Sat]);

const joinClasses = (...classes: Array<string | undefined>) =>
    classes.filter((value): value is string => value !== undefined).join(" ");

type AmountDenominatorProps = {
    class?: string;
    value: string;
};

const AmountDenominator = (props: AmountDenominatorProps) => {
    return (
        <>
            {iconDenominators.has(props.value) ? (
                <span
                    class={joinClasses("denominator", props.class)}
                    data-denominator={props.value}
                />
            ) : (
                <span class={joinClasses("denominator-text", props.class)}>
                    {props.value}
                </span>
            )}
        </>
    );
};

export default AmountDenominator;
