wip 

if you want to use the react demo instead of the prect, change the "react-hot-loader" dependency in pkgjson to use the npm one
alsooo, the dev server is using global transforms for the preact demo.

You can remove the {global: true} on the sucrase transform to speed things up a little bit.

I havn't reconfigured all the bundle configs to use global transform for preact - so they will probably error if you try to bundle the preact demo. They work fine on the react demo though