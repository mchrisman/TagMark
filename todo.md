

The execution of { } and @{ } expressions in TagMark is very inefficient. The expressions are transformed ("transformHandles") and recompiled (new CaseInsensitiveFunction) every time. The compiled functions need to be cached, but this is tricky because of the way scope variables are transformed and made case insensitive, so it will have to be done with care. 

Efficiency at compile time is not a pressing issue because it only has to be done once. On the other hand, the hot path of actually executing these functions needs to be made very efficient. 

Analyze the situation. Write as a proposal your plan for fixing it. Then go ahead and implement the fix, with unit tests.

