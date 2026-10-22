const React = require('d:/chutima/Slit-project/client/node_modules/react');
const ReactPDF = require('d:/chutima/Slit-project/client/node_modules/@react-pdf/renderer');
const fs = require('fs');

const { Document, Page, Text, View, StyleSheet } = ReactPDF;

const styles = StyleSheet.create({
  page: { padding: 10, fontSize: 8 },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#000',
    minHeight: 13.5,
    alignItems: 'stretch',
  },
  td: {
    borderRightWidth: 0.5,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0.5,
    paddingHorizontal: 0.3,
    overflow: 'hidden',
  },
  tdText: {
    fontSize: 5.2,
    textAlign: 'center',
    color: '#000',
  }
});

const MyDoc = () => (
  React.createElement(Document, {},
    React.createElement(Page, { size: 'A4', orientation: 'landscape', style: styles.page },
      React.createElement(View, { style: styles.dataRow },
        React.createElement(View, { style: [styles.td, { width: '10%' }] },
          React.createElement(Text, { style: styles.tdText }, "Item 1")
        ),
        React.createElement(View, { style: { width: '40%', flexDirection: 'column' } },
          React.createElement(View, { style: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#000', flex: 1, minHeight: 13.5 } },
            React.createElement(View, { style: [styles.td, { width: '50%' }] },
              React.createElement(Text, { style: styles.tdText }, "Tube 1 Spec")
            ),
            React.createElement(View, { style: [styles.td, { width: '50%' }] },
              React.createElement(Text, { style: styles.tdText }, "Tube 1 Lot")
            )
          ),
          React.createElement(View, { style: { flexDirection: 'row', flex: 1, minHeight: 13.5 } },
            React.createElement(View, { style: [styles.td, { width: '50%' }] },
              React.createElement(Text, { style: styles.tdText }, "Tube 2 Spec")
            ),
            React.createElement(View, { style: [styles.td, { width: '50%' }] },
              React.createElement(Text, { style: styles.tdText }, "Tube 2 Lot")
            )
          )
        ),
        React.createElement(View, { style: [styles.td, { width: '50%' }] },
          React.createElement(Text, { style: styles.tdText }, "Merged Speed & Temp")
        )
      )
    )
  )
);

ReactPDF.renderToFile(React.createElement(MyDoc), 'scratch/test_output.pdf')
  .then(() => console.log('Rendered test_output.pdf successfully!'))
  .catch(err => console.error('Error rendering:', err));
